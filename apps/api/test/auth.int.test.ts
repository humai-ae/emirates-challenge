import { createHash } from "node:crypto";
import { Logger } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AuditService } from "../src/audit/audit.service.js";
import { UserEntity } from "../src/database/entities/index.js";
import { CSRF, createTestApp, signIn, TEST_PASSWORD, type TestApp } from "./test-app.js";

const OMAR = "omar.siddiqui@emirates.test";

async function auditCount(t: TestApp): Promise<number> {
  const [{ count }]: Array<{ count: string }> = await t.dataSource.query(
    "SELECT count(*) AS count FROM audit_events",
  );
  return Number(count);
}

async function sessionCount(t: TestApp, email: string): Promise<number> {
  const [{ count }]: Array<{ count: string }> = await t.dataSource.query(
    "SELECT count(*) AS count FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = $1",
    [email],
  );
  return Number(count);
}

describe("password sign-in and sessions", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it("signs in with email and password, sets a hardened cookie and audits it", async () => {
    const before = await auditCount(t);
    const response = await t
      .http()
      .post("/api/v1/auth/login")
      .set(CSRF)
      .send({ email: OMAR, password: TEST_PASSWORD })
      .expect(200);
    expect(response.body).toEqual({
      user: {
        id: expect.any(String),
        email: OMAR,
        displayName: "Omar Siddiqui",
        role: "analyst",
        locale: "en",
        team: null,
        mustChangePassword: false,
      },
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
      actorName: "Omar Siddiqui",
      after: { method: "password" },
    });
  });

  it("accepts the email in any case and with surrounding spaces", async () => {
    const response = await t
      .http()
      .post("/api/v1/auth/login")
      .set(CSRF)
      .send({ email: "  Omar.Siddiqui@EMIRATES.test ", password: TEST_PASSWORD })
      .expect(200);
    expect(response.body.user.email).toBe(OMAR);
  });

  it("answers a wrong password, an unknown email and a deactivated account the same way, and writes nothing", async () => {
    const users = t.dataSource.getRepository(UserEntity);
    await users.update({ email: "ahmed.rahman@emirates.test" }, { isActive: false });
    const before = await auditCount(t);
    const attempts = [
      { email: OMAR, password: "not-the-password" },
      { email: "nobody@emirates.test", password: TEST_PASSWORD },
      { email: "ahmed.rahman@emirates.test", password: TEST_PASSWORD },
    ];
    for (const attempt of attempts) {
      const response = await t
        .http()
        .post("/api/v1/auth/login")
        .set(CSRF)
        .send(attempt)
        .expect(401);
      expect(response.body).toEqual({ code: "invalid_credentials", params: {} });
      expect(response.headers["set-cookie"]).toBeUndefined();
    }
    expect(await auditCount(t)).toBe(before);
    await users.update({ email: "ahmed.rahman@emirates.test" }, { isActive: true });
  });

  it("logs failed sign-ins with the account id only, never the email or the password", async () => {
    const warn = vi.spyOn(Logger.prototype, "warn");
    try {
      await t
        .http()
        .post("/api/v1/auth/login")
        .set(CSRF)
        .send({ email: OMAR, password: "guessed-password-1" })
        .expect(401);
      await t
        .http()
        .post("/api/v1/auth/login")
        .set(CSRF)
        .send({ email: "nobody@emirates.test", password: "guessed-password-2" })
        .expect(401);
      const omar = await t.dataSource.getRepository(UserEntity).findOneByOrFail({ email: OMAR });
      const lines = warn.mock.calls.map((call) => String(call[0]));
      expect(lines).toContain(`Failed sign-in for user ${omar.id}`);
      expect(lines).toContain("Failed sign-in for an unknown email");
      const logged = JSON.stringify(warn.mock.calls);
      for (const secret of [
        OMAR,
        "nobody@emirates.test",
        "guessed-password-1",
        "guessed-password-2",
      ]) {
        expect(logged).not.toContain(secret);
      }
    } finally {
      warn.mockRestore();
    }
  });

  it("returns the current user for a signed-in agent and 401 otherwise", async () => {
    const agent = await signIn(t, "priya.nair@emirates.test");
    const me = await agent.get("/api/v1/me").expect(200);
    expect(me.body.user.team).toMatchObject({ nameEn: "Payroll & Compensation" });
    const anonymous = await t.http().get("/api/v1/me").expect(401);
    expect(anonymous.body).toEqual({ code: "unauthenticated", params: {} });
  });

  it("rejects mutations without the CSRF header and writes nothing", async () => {
    const before = await auditCount(t);
    const response = await t
      .http()
      .post("/api/v1/auth/login")
      .send({ email: OMAR, password: TEST_PASSWORD })
      .expect(403);
    expect(response.body).toEqual({ code: "csrf_missing", params: {} });
    expect(await auditCount(t)).toBe(before);
  });

  it("validates the sign-in body", async () => {
    const response = await t
      .http()
      .post("/api/v1/auth/login")
      .set(CSRF)
      .send({ email: "not-an-email", password: "" })
      .expect(400);
    expect(response.body.code).toBe("validation_failed");
    expect(
      response.body.params.issues.map(
        (issue: { path: string; message: string }) => `${issue.path}:${issue.message}`,
      ),
    ).toEqual(["email:email_invalid", "password:required"]);
  });

  it("updates the language preference with an audited before/after, and skips no-ops", async () => {
    const agent = await signIn(t, "daniel.mensah@emirates.test");
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
    const agent = await signIn(t, "ahmed.rahman@emirates.test");
    const response = await agent.post("/api/v1/auth/logout").set(CSRF).expect(204);
    expect(String(response.headers["set-cookie"])).toMatch(/hrcc_session=;/);
    await agent.get("/api/v1/me").expect(401);
    const { events } = await t.app.get(AuditService).list({ limit: 1 });
    expect(events[0]?.action).toBe("auth.sign_out");
  });

  it("ends the session the browser presented when it signs in again", async () => {
    const email = "layla.haddad@emirates.test";
    const agent = await signIn(t, email);
    const before = await sessionCount(t, email);
    await agent
      .post("/api/v1/auth/login")
      .set(CSRF)
      .send({ email, password: TEST_PASSWORD })
      .expect(200);
    expect(await sessionCount(t, email)).toBe(before);
    await agent.get("/api/v1/me").expect(200);
  });

  it("treats expired and unknown session tokens as signed out and clears the cookie", async () => {
    const token = "expired-token-for-test";
    const omar = await t.dataSource.getRepository(UserEntity).findOneByOrFail({ email: OMAR });
    await t.dataSource.query(
      "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES ($1, $2, now() - interval '2 days', now() - interval '1 day')",
      [createHash("sha256").update(token).digest("hex"), omar.id],
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
    await Promise.all(
      Array.from({ length: 20 }, () =>
        t
          .http()
          .post("/api/v1/auth/login")
          .set(CSRF)
          .send({ email: OMAR, password: TEST_PASSWORD })
          .expect(200),
      ),
    );
    expect((await t.app.get(AuditService).verifyChain()).ok).toBe(true);
  });
});

describe("password sign-in turned off", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ AUTH_MODE: "oidc" });
  });
  afterAll(async () => {
    await t.close();
  });

  it("refuses password sign-in", async () => {
    const response = await t
      .http()
      .post("/api/v1/auth/login")
      .set(CSRF)
      .send({ email: OMAR, password: TEST_PASSWORD })
      .expect(403);
    expect(response.body).toEqual({ code: "password_auth_disabled", params: {} });
  });
});
