import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuditService } from "../src/audit/audit.service.js";
import { UserEntity } from "../src/database/entities/index.js";
import { createTestApp, type TestApp } from "./test-app.js";

const CSRF = { "x-hrcc-request": "1" };

async function userId(t: TestApp, username: string): Promise<string> {
  return (await t.dataSource.getRepository(UserEntity).findOneByOrFail({ username })).id;
}

async function auditCount(t: TestApp): Promise<number> {
  const [{ count }]: Array<{ count: string }> = await t.dataSource.query(
    "SELECT count(*) AS count FROM audit_events",
  );
  return Number(count);
}

describe("demo sign-in and sessions", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it("lists the demo users by role", async () => {
    const response = await t.http().get("/api/v1/auth/demo-users").expect(200);
    expect(response.body.users.map((user: { role: string }) => user.role)).toEqual([
      "admin",
      "analyst",
      "lead",
      "lead",
      "auditor",
    ]);
  });

  it("signs in, sets a hardened cookie and audits the sign-in", async () => {
    const before = await auditCount(t);
    const id = await userId(t, "omar.siddiqui");
    const response = await t
      .http()
      .post("/api/v1/auth/demo-login")
      .set(CSRF)
      .send({ userId: id })
      .expect(200);
    expect(response.body.user).toMatchObject({
      username: "omar.siddiqui",
      role: "analyst",
      team: null,
    });
    const cookie = String(response.headers["set-cookie"]);
    expect(cookie).toMatch(/hrcc_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(await auditCount(t)).toBe(before + 1);
    const { events } = await t.app.get(AuditService).list({ limit: 1 });
    expect(events[0]).toMatchObject({
      action: "auth.sign_in",
      objectId: id,
      actorName: "Omar Siddiqui",
    });
  });

  it("returns the current user for a signed-in agent and 401 otherwise", async () => {
    const agent = t.agent();
    await agent
      .post("/api/v1/auth/demo-login")
      .set(CSRF)
      .send({ userId: await userId(t, "priya.nair") })
      .expect(200);
    const me = await agent.get("/api/v1/me").expect(200);
    expect(me.body.user.team).toMatchObject({ nameEn: "Payroll & Compensation" });
    const anonymous = await t.http().get("/api/v1/me").expect(401);
    expect(anonymous.body).toEqual({ code: "unauthenticated", params: {} });
  });

  it("rejects mutations without the CSRF header and writes nothing", async () => {
    const before = await auditCount(t);
    const response = await t
      .http()
      .post("/api/v1/auth/demo-login")
      .send({ userId: await userId(t, "omar.siddiqui") })
      .expect(403);
    expect(response.body).toEqual({ code: "csrf_missing", params: {} });
    expect(await auditCount(t)).toBe(before);
  });

  it("validates the login body", async () => {
    const response = await t
      .http()
      .post("/api/v1/auth/demo-login")
      .set(CSRF)
      .send({ userId: "nope" })
      .expect(400);
    expect(response.body.code).toBe("validation_failed");
  });

  it("updates the language preference with an audited before/after, and skips no-ops", async () => {
    const agent = t.agent();
    await agent
      .post("/api/v1/auth/demo-login")
      .set(CSRF)
      .send({ userId: await userId(t, "daniel.mensah") });
    const before = await auditCount(t);
    const response = await agent
      .patch("/api/v1/me/preferences")
      .set(CSRF)
      .send({ locale: "ar" })
      .expect(200);
    expect(response.body.user.locale).toBe("ar");
    const { events } = await t.app.get(AuditService).list({ limit: 1 });
    expect(events[0]).toMatchObject({
      action: "user.preferences_update",
      before: { locale: "en" },
      after: { locale: "ar" },
    });
    await agent.patch("/api/v1/me/preferences").set(CSRF).send({ locale: "ar" }).expect(200);
    expect(await auditCount(t)).toBe(before + 1);
  });

  it("logs out, clears the cookie and audits it", async () => {
    const agent = t.agent();
    await agent
      .post("/api/v1/auth/demo-login")
      .set(CSRF)
      .send({ userId: await userId(t, "ahmed.rahman") });
    const response = await agent.post("/api/v1/auth/logout").set(CSRF).expect(204);
    expect(String(response.headers["set-cookie"])).toMatch(/hrcc_session=;/);
    await agent.get("/api/v1/me").expect(401);
    const { events } = await t.app.get(AuditService).list({ limit: 1 });
    expect(events[0]?.action).toBe("auth.sign_out");
  });

  it("treats expired and unknown session tokens as signed out and clears the cookie", async () => {
    const token = "expired-token-for-test";
    await t.dataSource.query(
      "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES ($1, $2, now() - interval '2 days', now() - interval '1 day')",
      [createHash("sha256").update(token).digest("hex"), await userId(t, "omar.siddiqui")],
    );
    const expired = await t
      .http()
      .get("/api/v1/me")
      .set("Cookie", `hrcc_session=${token}`)
      .expect(401);
    expect(String(expired.headers["set-cookie"])).toMatch(/hrcc_session=;/);
    await t.http().get("/api/v1/me").set("Cookie", "hrcc_session=forged").expect(401);
  });

  it("keeps the audit chain intact under 20 simultaneous sign-ins", async () => {
    const id = await userId(t, "omar.siddiqui");
    await Promise.all(
      Array.from({ length: 20 }, () =>
        t.http().post("/api/v1/auth/demo-login").set(CSRF).send({ userId: id }).expect(200),
      ),
    );
    const result = await t.app.get(AuditService).verifyChain();
    expect(result.ok).toBe(true);
  });
});

describe("demo sign-in turned off", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ AUTH_MODE: "oidc" });
  });
  afterAll(async () => {
    await t.close();
  });

  it("refuses the demo endpoints", async () => {
    const list = await t.http().get("/api/v1/auth/demo-users").expect(403);
    expect(list.body).toEqual({ code: "demo_auth_disabled", params: {} });
    await t
      .http()
      .post("/api/v1/auth/demo-login")
      .set(CSRF)
      .send({ userId: "8f0f4b8e-4a52-4f7e-9a39-1d5f6c0e2a11" })
      .expect(403);
  });
});
