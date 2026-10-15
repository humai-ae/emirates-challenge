import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UserEntity } from "../src/database/entities/index.js";
import { CSRF, createTestApp, signIn, TEST_PASSWORD, type TestApp } from "./test-app.js";

const LAYLA = "layla.haddad@emirates.test";
const TEMPORARY = "temporary-pass-1";

function newUser(overrides: Record<string, unknown> = {}) {
  return {
    email: "sara.ali@emirates.test",
    displayName: "Sara Ali",
    role: "analyst",
    teamId: null,
    locale: "en",
    password: TEMPORARY,
    ...overrides,
  };
}

async function idOf(t: TestApp, email: string): Promise<string> {
  return (await t.dataSource.getRepository(UserEntity).findOneByOrFail({ email })).id;
}

async function auditJson(t: TestApp): Promise<string> {
  return JSON.stringify(await t.dataSource.query("SELECT * FROM audit_events ORDER BY seq"));
}

describe("user administration", () => {
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof signIn>>;
  beforeAll(async () => {
    t = await createTestApp();
    admin = await signIn(t, LAYLA);
  });
  afterAll(async () => {
    await t.close();
  });

  it("lists users, without password hashes, for admins only", async () => {
    const response = await admin.get("/api/v1/users").expect(200);
    expect(response.body.users.map((user: { role: string }) => user.role)).toEqual([
      "admin",
      "analyst",
      "lead",
      "lead",
      "auditor",
    ]);
    expect(response.body.users[0]).toEqual({
      id: expect.any(String),
      email: LAYLA,
      displayName: "Layla Haddad",
      role: "admin",
      locale: "en",
      team: null,
      mustChangePassword: false,
      isActive: true,
      isDemo: true,
      createdAt: expect.any(String),
    });
    expect(JSON.stringify(response.body)).not.toContain("scrypt$");
    const analyst = await signIn(t, "omar.siddiqui@emirates.test");
    const forbidden = await analyst.get("/api/v1/users").expect(403);
    expect(forbidden.body).toEqual({ code: "forbidden", params: {} });
    await analyst.get("/api/v1/teams").expect(403);
  });

  it("lists the teams for the user form", async () => {
    const response = await admin.get("/api/v1/teams").expect(200);
    expect(response.body.teams.map((team: { nameEn: string }) => team.nameEn)).toEqual([
      "Onboarding",
      "Payroll & Compensation",
    ]);
  });

  it("creates a user who must change the temporary password at first sign-in", async () => {
    const response = await admin
      .post("/api/v1/users")
      .set(CSRF)
      .send(newUser({ email: " Sara.Ali@Emirates.TEST ", locale: "ar" }))
      .expect(201);
    expect(response.body.user).toMatchObject({
      email: "sara.ali@emirates.test",
      displayName: "Sara Ali",
      role: "analyst",
      locale: "ar",
      team: null,
      mustChangePassword: true,
      isActive: true,
      isDemo: false,
    });
    const signedIn = await t
      .http()
      .post("/api/v1/auth/login")
      .set(CSRF)
      .send({ email: "sara.ali@emirates.test", password: TEMPORARY })
      .expect(200);
    expect(signedIn.body.user.mustChangePassword).toBe(true);
    const json = await auditJson(t);
    expect(json).toContain("user.create");
    expect(json).not.toContain(TEMPORARY);
    expect(json).not.toContain("scrypt$");
  });

  it("requires a team for team leads and rejects a team that does not exist", async () => {
    const missing = await admin
      .post("/api/v1/users")
      .set(CSRF)
      .send(newUser({ email: "lead.one@emirates.test", role: "lead" }))
      .expect(400);
    expect(missing.body.params.issues.map((issue: { message: string }) => issue.message)).toEqual([
      "team_required",
    ]);
    const unknown = await admin
      .post("/api/v1/users")
      .set(CSRF)
      .send(
        newUser({
          email: "lead.one@emirates.test",
          role: "lead",
          teamId: "0b8f1f3e-5c2a-4d4b-9e7a-6f1c2d3e4a5b",
        }),
      )
      .expect(400);
    expect(unknown.body).toEqual({ code: "team_not_found", params: {} });
    const teams = await admin.get("/api/v1/teams").expect(200);
    const created = await admin
      .post("/api/v1/users")
      .set(CSRF)
      .send(
        newUser({ email: "lead.one@emirates.test", role: "lead", teamId: teams.body.teams[0].id }),
      )
      .expect(201);
    expect(created.body.user.team).toMatchObject({ nameEn: "Onboarding" });
  });

  it("rejects a duplicate email, even in another case or at the same moment", async () => {
    const taken = await admin
      .post("/api/v1/users")
      .set(CSRF)
      .send(newUser({ email: "OMAR.SIDDIQUI@emirates.test" }))
      .expect(409);
    expect(taken.body).toEqual({ code: "email_taken", params: {} });
    const statuses = await Promise.all(
      [1, 2].map(() =>
        admin
          .post("/api/v1/users")
          .set(CSRF)
          .send(newUser({ email: "same.moment@emirates.test" }))
          .then((response) => response.status),
      ),
    );
    expect(statuses.sort()).toEqual([201, 409]);
  });

  it("deactivates and reactivates a user, ending their sessions", async () => {
    const email = "ahmed.rahman@emirates.test";
    const id = await idOf(t, email);
    const ahmed = await signIn(t, email);
    const deactivated = await admin.post(`/api/v1/users/${id}/deactivate`).set(CSRF).expect(200);
    expect(deactivated.body.user.isActive).toBe(false);
    await ahmed.get("/api/v1/me").expect(401);
    await t
      .http()
      .post("/api/v1/auth/login")
      .set(CSRF)
      .send({ email, password: TEST_PASSWORD })
      .expect(401);
    const reactivated = await admin.post(`/api/v1/users/${id}/reactivate`).set(CSRF).expect(200);
    expect(reactivated.body.user.isActive).toBe(true);
    await t
      .http()
      .post("/api/v1/auth/login")
      .set(CSRF)
      .send({ email, password: TEST_PASSWORD })
      .expect(200);
    const json = await auditJson(t);
    expect(json).toContain("user.deactivate");
    expect(json).toContain("user.reactivate");
  });

  it("resets a password: the user is signed out everywhere and must choose a new one", async () => {
    const email = "priya.nair@emirates.test";
    const id = await idOf(t, email);
    const priya = await signIn(t, email);
    const reset = await admin
      .post(`/api/v1/users/${id}/reset-password`)
      .set(CSRF)
      .send({ password: "reset-password-1" })
      .expect(200);
    expect(reset.body.user.mustChangePassword).toBe(true);
    await priya.get("/api/v1/me").expect(401);
    await t
      .http()
      .post("/api/v1/auth/login")
      .set(CSRF)
      .send({ email, password: TEST_PASSWORD })
      .expect(401);
    const signedIn = await t
      .http()
      .post("/api/v1/auth/login")
      .set(CSRF)
      .send({ email, password: "reset-password-1" })
      .expect(200);
    expect(signedIn.body.user.mustChangePassword).toBe(true);
    const json = await auditJson(t);
    expect(json).toContain("user.password_reset");
    expect(json).not.toContain("reset-password-1");
  });

  it("validates user ids and reports unknown users", async () => {
    await admin.post("/api/v1/users/not-a-uuid/deactivate").set(CSRF).expect(400);
    const missing = await admin
      .post("/api/v1/users/0b8f1f3e-5c2a-4d4b-9e7a-6f1c2d3e4a5b/reactivate")
      .set(CSRF)
      .expect(404);
    expect(missing.body).toEqual({ code: "not_found", params: {} });
  });

  it("protects the admin's own account", async () => {
    const id = await idOf(t, LAYLA);
    const deactivate = await admin.post(`/api/v1/users/${id}/deactivate`).set(CSRF).expect(409);
    expect(deactivate.body).toEqual({ code: "own_account", params: {} });
    const reset = await admin
      .post(`/api/v1/users/${id}/reset-password`)
      .set(CSRF)
      .send({ password: "reset-password-1" })
      .expect(409);
    expect(reset.body).toEqual({ code: "own_account", params: {} });
  });

  // Last: it may deactivate Layla, whom the other tests sign in as.
  it("keeps one admin active when two admins deactivate each other at once", async () => {
    await admin
      .post("/api/v1/users")
      .set(CSRF)
      .send(
        newUser({ email: "noor.admin@emirates.test", displayName: "Noor Admin", role: "admin" }),
      )
      .expect(201);
    const noor = await signIn(t, "noor.admin@emirates.test", TEMPORARY);
    await noor
      .post("/api/v1/me/password")
      .set(CSRF)
      .send({ currentPassword: TEMPORARY, newPassword: "noor-own-password-1" })
      .expect(200);
    const laylaId = await idOf(t, LAYLA);
    const noorId = await idOf(t, "noor.admin@emirates.test");
    const statuses = await Promise.all([
      admin
        .post(`/api/v1/users/${noorId}/deactivate`)
        .set(CSRF)
        .then((response) => response.status),
      noor
        .post(`/api/v1/users/${laylaId}/deactivate`)
        .set(CSRF)
        .then((response) => response.status),
    ]);
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    const active = await t.dataSource
      .getRepository(UserEntity)
      .countBy({ role: "admin", isActive: true });
    expect(active).toBe(1);
  });
});
