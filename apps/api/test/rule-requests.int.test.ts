import type { RuleRequestsResponse, RuleResponse } from "@hrcc/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { uploadPack } from "./packs.js";
import { CSRF, createTestApp, signIn, type TestApp } from "./test-app.js";

type Agent = Awaited<ReturnType<typeof signIn>>;
const REQUESTER_RULE = "The person who requests a transaction must not also approve it.";

describe("rule requests", () => {
  let t: TestApp;
  let admin: Agent;
  let analyst: Agent;
  beforeAll(async () => {
    t = await createTestApp();
    admin = await signIn(t, "layla.haddad@emirates.test");
    analyst = await signIn(t, "omar.siddiqui@emirates.test");
  });
  afterAll(async () => {
    await t.close();
  });

  const ask = (agent: Agent, text: string) =>
    agent.post("/api/v1/rule-requests").set(CSRF).send({ text });
  const mine = async (agent: Agent) =>
    ((await agent.get("/api/v1/rule-requests").expect(200)).body as RuleRequestsResponse).requests;

  it("needs data loaded before a rule can be requested", async () => {
    expect((await ask(analyst, REQUESTER_RULE).expect(409)).body.code).toBe("no_dataset");
  });

  it("lets an analyst request a rule, drafted for the admin to review", async () => {
    await uploadPack(admin);
    const response = await ask(analyst, REQUESTER_RULE).expect(201);
    expect(response.body.request).toMatchObject({
      ruleId: "W-01",
      text: REQUESTER_RULE,
      requestedBy: "Omar Siddiqui",
      outcome: "waiting",
      reason: null,
    });
    const rule = ((await admin.get("/api/v1/rules/W-01").expect(200)).body as RuleResponse).rule;
    expect(rule.requestedBy).toBe("Omar Siddiqui");
    expect(rule.versions[0]).toMatchObject({
      status: "draft",
      preset: "requester_not_approver",
      createdBy: "Omar Siddiqui",
    });
    const audit = await admin.get("/api/v1/audit?action=rule.request").expect(200);
    expect(audit.body.events[0]).toMatchObject({ objectId: "W-01", actorName: "Omar Siddiqui" });
  });

  it("shows analysts only their own requests, and admins every one", async () => {
    await ask(admin, "Every exit must have a clearance form attached.").expect(201);
    expect((await mine(analyst)).map((request) => request.ruleId)).toEqual(["W-01"]);
    expect((await mine(admin)).map((request) => request.ruleId)).toEqual(["W-02", "W-01"]);
  });

  it("tells the analyst what became of the request", async () => {
    const rule = ((await admin.get("/api/v1/rules/W-01").expect(200)).body as RuleResponse).rule;
    await admin
      .post("/api/v1/rules/W-01/reject")
      .set(CSRF)
      .send({ rowVersion: rule.rowVersion, reason: "Rule R-02 covers this already." })
      .expect(200);
    expect((await mine(analyst))[0]).toMatchObject({
      outcome: "rejected",
      reason: "Rule R-02 covers this already.",
    });
  });

  it("keeps leads and auditors out", async () => {
    for (const email of ["priya.nair@emirates.test", "daniel.mensah@emirates.test"]) {
      const agent = await signIn(t, email);
      await agent.get("/api/v1/rule-requests").expect(403);
      await ask(agent, REQUESTER_RULE).expect(403);
    }
  });
});
