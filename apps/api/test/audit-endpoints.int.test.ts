import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UserEntity } from "../src/database/entities/index.js";
import { createTestApp, type TestApp } from "./test-app.js";

const CSRF = { "x-hrcc-request": "1" };

async function signedIn(t: TestApp, username: string) {
  const agent = t.agent();
  const user = await t.dataSource.getRepository(UserEntity).findOneByOrFail({ username });
  await agent.post("/api/v1/auth/demo-login").set(CSRF).send({ userId: user.id }).expect(200);
  return agent;
}

describe("audit endpoints", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it("lets an auditor read the log newest first, with paging", async () => {
    const auditor = await signedIn(t, "daniel.mensah");
    await signedIn(t, "omar.siddiqui");
    const page = await auditor.get("/api/v1/audit?limit=1").expect(200);
    expect(page.body.events).toHaveLength(1);
    expect(page.body.events[0]).toMatchObject({
      action: "auth.sign_in",
      actorName: "Omar Siddiqui",
    });
    expect(page.body.nextBefore).toBe(page.body.events[0].seq);
    const next = await auditor
      .get(`/api/v1/audit?limit=1&before=${page.body.nextBefore}`)
      .expect(200);
    expect(next.body.events[0]).toMatchObject({ actorName: "Daniel Mensah" });
  });

  it("lets an admin read the log", async () => {
    const admin = await signedIn(t, "layla.haddad");
    await admin.get("/api/v1/audit").expect(200);
  });

  it("forbids analysts and team leads", async () => {
    const analyst = await signedIn(t, "omar.siddiqui");
    const response = await analyst.get("/api/v1/audit").expect(403);
    expect(response.body).toEqual({ code: "forbidden", params: {} });
    const lead = await signedIn(t, "priya.nair");
    await lead.post("/api/v1/audit/integrity-check").set(CSRF).expect(403);
  });

  it("rejects an invalid query", async () => {
    const auditor = await signedIn(t, "daniel.mensah");
    const response = await auditor.get("/api/v1/audit?limit=999").expect(400);
    expect(response.body.code).toBe("validation_failed");
  });

  it("runs the integrity check and records that it ran", async () => {
    const auditor = await signedIn(t, "daniel.mensah");
    const response = await auditor.post("/api/v1/audit/integrity-check").set(CSRF).expect(200);
    expect(response.body).toMatchObject({ ok: true });
    expect(response.body.count).toBeGreaterThan(0);
    expect(typeof response.body.checkedAt).toBe("string");
    const latest = await auditor.get("/api/v1/audit?limit=1").expect(200);
    expect(latest.body.events[0]).toMatchObject({
      action: "audit.integrity_check",
      after: { ok: true, count: response.body.count },
    });
  });

  it("reports the first altered entry", async () => {
    await t.dataSource.query(
      "ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_update_delete",
    );
    await t.dataSource.query(
      "UPDATE audit_events SET actor_name = 'Someone Else' WHERE event_id = 'EV-0000002'",
    );
    await t.dataSource.query(
      "ALTER TABLE audit_events ENABLE TRIGGER audit_events_no_update_delete",
    );
    const auditor = await signedIn(t, "daniel.mensah");
    const response = await auditor.post("/api/v1/audit/integrity-check").set(CSRF).expect(200);
    expect(response.body).toMatchObject({ ok: false, brokenAt: "EV-0000002" });
  });
});
