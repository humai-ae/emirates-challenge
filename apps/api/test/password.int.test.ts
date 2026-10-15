import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UserEntity } from "../src/database/entities/index.js";
import { CSRF, createTestApp, signIn, TEST_PASSWORD, type TestApp } from "./test-app.js";

const NEW_PASSWORD = "a-brand-new-password-7";

async function auditJson(t: TestApp): Promise<string> {
  return JSON.stringify(await t.dataSource.query("SELECT * FROM audit_events ORDER BY seq"));
}

describe("password changes", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it("makes a user with a temporary password change it before anything else", async () => {
    const email = "layla.haddad@emirates.test";
    await t.dataSource.getRepository(UserEntity).update({ email }, { mustChangePassword: true });
    const agent = await signIn(t, email);
    const me = await agent.get("/api/v1/me").expect(200);
    expect(me.body.user.mustChangePassword).toBe(true);
    const blocked = await agent.get("/api/v1/audit").expect(403);
    expect(blocked.body).toEqual({ code: "password_change_required", params: {} });
    await agent.patch("/api/v1/me/preferences").set(CSRF).send({ locale: "ar" }).expect(200);
    const changed = await agent
      .post("/api/v1/me/password")
      .set(CSRF)
      .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD })
      .expect(200);
    expect(changed.body.user.mustChangePassword).toBe(false);
    await agent.get("/api/v1/audit").expect(200);
  });

  it("rejects a wrong current password, an unchanged password and a short one", async () => {
    const agent = await signIn(t, "omar.siddiqui@emirates.test");
    const wrong = await agent
      .post("/api/v1/me/password")
      .set(CSRF)
      .send({ currentPassword: "not-the-password", newPassword: NEW_PASSWORD })
      .expect(400);
    expect(wrong.body).toEqual({ code: "wrong_password", params: {} });
    const unchanged = await agent
      .post("/api/v1/me/password")
      .set(CSRF)
      .send({ currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD })
      .expect(400);
    expect(unchanged.body).toEqual({ code: "password_unchanged", params: {} });
    const short = await agent
      .post("/api/v1/me/password")
      .set(CSRF)
      .send({ currentPassword: TEST_PASSWORD, newPassword: "short" })
      .expect(400);
    expect(short.body.params.issues.map((issue: { message: string }) => issue.message)).toEqual([
      "password_too_short",
    ]);
  });

  it("ends the user's other sessions, keeps the current one and audits the change without the password", async () => {
    const email = "priya.nair@emirates.test";
    const current = await signIn(t, email);
    const other = await signIn(t, email);
    await current
      .post("/api/v1/me/password")
      .set(CSRF)
      .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD })
      .expect(200);
    await other.get("/api/v1/me").expect(401);
    await current.get("/api/v1/me").expect(200);
    await t
      .http()
      .post("/api/v1/auth/login")
      .set(CSRF)
      .send({ email, password: TEST_PASSWORD })
      .expect(401);
    await t
      .http()
      .post("/api/v1/auth/login")
      .set(CSRF)
      .send({ email, password: NEW_PASSWORD })
      .expect(200);
    const json = await auditJson(t);
    expect(json).toContain("auth.password_change");
    expect(json).not.toContain(NEW_PASSWORD);
    expect(json).not.toContain("scrypt$");
  });

  it("signs out a deactivated user on their next request", async () => {
    const email = "daniel.mensah@emirates.test";
    const agent = await signIn(t, email);
    await t.dataSource.getRepository(UserEntity).update({ email }, { isActive: false });
    const response = await agent.get("/api/v1/me").expect(401);
    expect(response.body).toEqual({ code: "unauthenticated", params: {} });
    expect(String(response.headers["set-cookie"])).toMatch(/hrcc_session=;/);
    const [{ count }]: Array<{ count: string }> = await t.dataSource.query(
      "SELECT count(*) AS count FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = $1",
      [email],
    );
    expect(Number(count)).toBe(0);
  });
});
