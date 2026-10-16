import type { Rule, RuleResponse } from "@hrcc/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixture, mappingOf, uploadPack } from "./packs.js";
import { CSRF, createTestApp, signIn, type TestApp } from "./test-app.js";

type Agent = Awaited<ReturnType<typeof signIn>>;
type Action = "approve" | "reject" | "edit" | "retire";

const SETTINGS = {
  severity: "High",
  ownerTeamId: null,
  suggestedActionEn: "Fix the transaction.",
  suggestedActionAr: "صحّح المعاملة.",
};

const statuses = (rule: Rule) =>
  rule.versions.map((version) => [version.version, version.status, version.closedFor]);

describe("rule decisions", () => {
  let t: TestApp;
  let admin: Agent;
  let datasetId: string;
  beforeAll(async () => {
    t = await createTestApp();
    admin = await signIn(t, "layla.haddad@emirates.test");
    datasetId = (await uploadPack(admin)).id;
    await admin
      .post("/api/v1/policies")
      .set(CSRF)
      .attach("policy", fixture("policy_rules.md"), "policy_rules.md")
      .expect(201);
  });
  afterAll(async () => {
    await t.close();
  });

  const act = (id: string, action: Action, body: object) =>
    admin.post(`/api/v1/rules/${id}/${action}`).set(CSRF).send(body);
  const ruleOf = (response: { body: unknown }) => (response.body as RuleResponse).rule;

  it("approves a draft, recording who approved it and when", async () => {
    const approved = ruleOf(await act("R-01", "approve", { rowVersion: 1 }).expect(200));
    expect(approved.rowVersion).toBe(2);
    expect(approved.versions[0]).toMatchObject({
      version: 1,
      status: "active",
      approvedBy: "Layla Haddad",
    });
    expect(approved.versions[0]?.approvedAt).not.toBeNull();
    const events = await t.dataSource.query(
      "SELECT object_id, after FROM audit_events WHERE action = 'rule.approve'",
    );
    expect(events).toEqual([
      {
        object_id: "R-01",
        after: expect.objectContaining({ version: 1, preset: "approver_min_grade" }),
      },
    ]);
  });

  it("opens a new version of a live rule, which replaces the old one when approved", async () => {
    const opened = ruleOf(await act("R-01", "edit", { rowVersion: 2 }).expect(200));
    expect(statuses(opened)).toEqual([
      [2, "draft", null],
      [1, "active", null],
    ]);
    expect(opened.versions[0]?.parameters).toEqual(opened.versions[1]?.parameters);
    const twice = await act("R-01", "edit", { rowVersion: 3 }).expect(409);
    expect(twice.body.code).toBe("rule_draft_open");
    await admin
      .patch("/api/v1/rules/R-01/draft")
      .set(CSRF)
      .send({
        rowVersion: 3,
        preset: "approver_min_grade",
        values: { types: ["allowance_change"], amount_limit: 20000, min_approver_grade: 10 },
        ...SETTINGS,
      })
      .expect(200);
    const replaced = ruleOf(await act("R-01", "approve", { rowVersion: 4 }).expect(200));
    expect(statuses(replaced)).toEqual([
      [2, "active", null],
      [1, "retired", "replaced"],
    ]);
  });

  it("rejects a draft with a reason, and can draft it again", async () => {
    const rejected = ruleOf(
      await act("R-02", "reject", {
        rowVersion: 1,
        reason: "Covered by the payroll control",
      }).expect(200),
    );
    expect(rejected.versions[0]).toMatchObject({
      status: "rejected",
      reason: "Covered by the payroll control",
      closedBy: "Layla Haddad",
      closedFor: null,
    });
    expect(
      (await act("R-02", "reject", { rowVersion: 2, reason: "Again" }).expect(409)).body.code,
    ).toBe("rule_not_open");
    expect((await act("R-02", "approve", { rowVersion: 2 }).expect(409)).body.code).toBe(
      "rule_not_open",
    );
    const reopened = ruleOf(await act("R-02", "edit", { rowVersion: 2 }).expect(200));
    expect(statuses(reopened)).toEqual([
      [2, "draft", null],
      [1, "rejected", null],
    ]);
    const blank = await act("R-02", "reject", { rowVersion: 3, reason: "  " }).expect(400);
    expect(blank.body.code).toBe("validation_failed");
  });

  it("retires a live rule and closes its open draft", async () => {
    await act("R-03", "approve", { rowVersion: 1 }).expect(200);
    await act("R-03", "edit", { rowVersion: 2 }).expect(200);
    const retired = ruleOf(
      await act("R-03", "retire", {
        rowVersion: 3,
        reason: "Exit checks moved to the offboarding system",
      }).expect(200),
    );
    expect(
      retired.versions.map((version) => [
        version.version,
        version.status,
        version.reason,
        version.closedFor,
      ]),
    ).toEqual([
      [2, "rejected", null, "rule_retired"],
      [1, "retired", "Exit checks moved to the offboarding system", null],
    ]);
    const again = await act("R-03", "retire", { rowVersion: 4, reason: "Again" }).expect(409);
    expect(again.body.code).toBe("rule_not_active");
  });

  it("refuses decisions made on a stale copy, and lets only admins decide", async () => {
    const stale: Array<[Action, object]> = [
      ["approve", { rowVersion: 7 }],
      ["reject", { rowVersion: 7, reason: "Stale" }],
      ["edit", { rowVersion: 7 }],
      ["retire", { rowVersion: 7, reason: "Stale" }],
    ];
    for (const [action, body] of stale) {
      const response = await act("R-04", action, body).expect(409);
      expect(response.body.code, action).toBe("rule_changed");
    }
    const analyst = await signIn(t, "omar.siddiqui@emirates.test");
    await analyst.post("/api/v1/rules/R-04/approve").set(CSRF).send({ rowVersion: 1 }).expect(403);
    const untouched = (await admin.get("/api/v1/rules/R-04").expect(200)).body.rule as Rule;
    expect(untouched.rowVersion).toBe(1);
    expect(statuses(untouched)).toEqual([[1, "draft", null]]);
  });

  it("refuses to approve a check the data can't run", async () => {
    const detail = await admin.get(`/api/v1/datasets/${datasetId}`).expect(200);
    await admin
      .patch(`/api/v1/datasets/${datasetId}/columns`)
      .set(CSRF)
      .send(mappingOf(detail.body.dataset.columns, ["approver_ids"]))
      .expect(200);
    // R-02's draft compares the requester with the approvers, whose columns now have no role.
    const refused = await act("R-02", "approve", { rowVersion: 3 }).expect(409);
    expect(refused.body).toEqual({ code: "check_invalid", params: {} });
    const saved = ruleOf(
      await admin
        .patch("/api/v1/rules/R-02/draft")
        .set(CSRF)
        .send({
          rowVersion: 3,
          preset: "requester_not_approver",
          values: { types: null },
          ...SETTINGS,
        })
        .expect(200),
    );
    expect(saved.versions[0]).toMatchObject({
      status: "needs_data",
      check: null,
      needs: [{ file: "transactions", role: "approver_ids" }],
    });
    expect((await act("R-02", "approve", { rowVersion: 4 }).expect(409)).body.code).toBe(
      "check_invalid",
    );
  });
});
