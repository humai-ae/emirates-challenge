import type { CountsResponse, NoticesResponse, RuleRequestResponse } from "@hrcc/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Agent, approve, EMAILS } from "./flags-setup.js";
import { uploadPack } from "./packs.js";
import { CSRF, createTestApp, signIn, type TestApp } from "./test-app.js";

describe("notices and counts", () => {
  let t: TestApp;
  let admin: Agent;
  let analyst: Agent;
  beforeAll(async () => {
    t = await createTestApp();
    admin = await signIn(t, EMAILS.admin);
    analyst = await signIn(t, EMAILS.analyst);
    await uploadPack(admin);
  });
  afterAll(async () => {
    await t.close();
  });

  const notices = async (agent: Agent) =>
    (await agent.get("/api/v1/notices").expect(200)).body as NoticesResponse;
  const counts = async (agent: Agent) =>
    (await agent.get("/api/v1/me/counts").expect(200)).body as CountsResponse;
  const ask = async (text: string) =>
    (
      (await analyst.post("/api/v1/rule-requests").set(CSRF).send({ text }).expect(201))
        .body as RuleRequestResponse
    ).request.ruleId;

  it("tells the analyst when a rule they asked for goes live or is rejected", async () => {
    expect(await notices(analyst)).toEqual({ notices: [], unread: 0 });
    const live = await ask("The person who requests a transaction must not also approve it.");
    const rejected = await ask("Every exit must have a clearance form attached.");
    await approve(admin, live);
    const rule = (await admin.get(`/api/v1/rules/${rejected}`).expect(200)).body.rule as {
      rowVersion: number;
    };
    await admin
      .post(`/api/v1/rules/${rejected}/reject`)
      .set(CSRF)
      .send({ rowVersion: rule.rowVersion, reason: "Rule R-03 already covers exits." })
      .expect(200);
    const { notices: list, unread } = await notices(analyst);
    expect(unread).toBe(2);
    expect(list.map((notice) => [notice.kind, notice.params.ruleId])).toEqual([
      ["rule_request_rejected", rejected],
      ["rule_request_live", live],
    ]);
    expect(list[0]?.params.reason).toBe("Rule R-03 already covers exits.");
    expect(await counts(analyst)).toEqual({ inbox: 0, fixChecks: 0, queue: null, notices: 2 });
    // The admin who decided is told nothing.
    expect((await notices(admin)).unread).toBe(0);
  });

  it("marks one notice read, or all of them", async () => {
    const [first] = (await notices(analyst)).notices;
    const afterOne = (
      await analyst.post(`/api/v1/notices/${first?.id}/read`).set(CSRF).send({}).expect(200)
    ).body as NoticesResponse;
    expect(afterOne.unread).toBe(1);
    expect(afterOne.notices[0]?.readAt).not.toBeNull();
    await admin.post(`/api/v1/notices/${first?.id}/read`).set(CSRF).send({}).expect(404);
    const afterAll = (await analyst.post("/api/v1/notices/read-all").set(CSRF).send({}).expect(200))
      .body as NoticesResponse;
    expect(afterAll.unread).toBe(0);
    expect((await counts(analyst)).notices).toBe(0);
  });

  it("counts what each role has waiting", async () => {
    const lead = await signIn(t, EMAILS.payrollLead);
    expect(await counts(lead)).toEqual({ inbox: null, fixChecks: null, queue: 0, notices: 0 });
    const auditor = await signIn(t, EMAILS.auditor);
    expect(await counts(auditor)).toEqual({
      inbox: null,
      fixChecks: null,
      queue: null,
      notices: 0,
    });
  });
});
