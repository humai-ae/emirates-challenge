import type { PreviewRuleResponse, Rule, RuleResponse, TeamsListResponse } from "@hrcc/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixture, uploadPack } from "./packs.js";
import { CSRF, createTestApp, signIn, type TestApp } from "./test-app.js";

type Agent = Awaited<ReturnType<typeof signIn>>;
const R01 = { types: ["allowance_change"], amount_limit: 10000, min_approver_grade: 10 };

function draftEdit(rowVersion: number, overrides: Record<string, unknown> = {}) {
  return {
    rowVersion,
    preset: "approver_min_grade",
    values: R01,
    severity: "High",
    ownerTeamId: null,
    suggestedActionEn:
      "Get approval from an approver at the required grade, or reverse the change.",
    suggestedActionAr: "احصل على اعتماد من معتمِد في الدرجة المطلوبة، أو ألغِ التغيير.",
    ...overrides,
  };
}

describe("rule drafts", () => {
  let t: TestApp;
  let admin: Agent;
  beforeAll(async () => {
    t = await createTestApp();
    admin = await signIn(t, "layla.haddad@emirates.test");
    await uploadPack(admin);
    await admin
      .post("/api/v1/policies")
      .set(CSRF)
      .attach("policy", fixture("policy_rules.md"), "policy_rules.md")
      .expect(201);
  });
  afterAll(async () => {
    await t.close();
  });

  const preview = (body: object) =>
    admin.post("/api/v1/rules/preview").set(CSRF).send(body).expect(200);
  const edit = (id: string, body: object) =>
    admin.patch(`/api/v1/rules/${id}/draft`).set(CSRF).send(body);

  it("previews a check on the loaded data", async () => {
    const response = await preview({ preset: "approver_min_grade", values: R01 });
    const body = response.body as PreviewRuleResponse;
    expect(body.dataset).toMatchObject({ name: "Training pack", transactionCount: 300 });
    if (body.result.status !== "ok")
      throw new Error(`Expected a preview, got ${body.result.status}`);
    expect(body.result.restatementEn).toBe(
      "Flags allowance_change transactions over 10,000 where no approver is grade 10 or above.",
    );
    // The pack's answer key plants 1 break of this rule among its 73 allowance changes.
    expect(body.result.preview).toMatchObject({ total: 300, applicable: 73 });
    expect(body.result.preview.counts.flagged).toBe(1);
    expect(body.result.preview.flagged[0]?.evidence.length).toBeGreaterThan(0);
  });

  it("explains values that don't fit the check type", async () => {
    const response = await preview({
      preset: "field_compare",
      values: { field: "employee_id", operator: "between", value: 5 },
    });
    expect((response.body as PreviewRuleResponse).result).toEqual({
      status: "invalid_parameters",
      issues: [
        { parameter: "field", problem: "column_type" },
        { parameter: "operator", problem: "not_a_choice" },
      ],
    });
  });

  it("saves an admin's edits to the draft and marks the values they changed", async () => {
    const teams = (await admin.get("/api/v1/teams").expect(200)).body as TeamsListResponse;
    const payroll = teams.teams.find((team) => team.nameEn === "Payroll & Compensation");
    const response = await edit(
      "R-01",
      draftEdit(1, {
        values: { ...R01, amount_limit: 15000 },
        severity: "Medium",
        ownerTeamId: payroll?.id,
        suggestedActionEn: "Escalate to the compensation committee.",
        suggestedActionAr: "صعّد الأمر إلى لجنة التعويضات.",
      }),
    ).expect(200);
    const rule = (response.body as RuleResponse).rule;
    expect(rule.rowVersion).toBe(2);
    expect(rule.versions).toHaveLength(1);
    const draft = rule.versions[0];
    expect(draft).toMatchObject({
      status: "draft",
      draftedBy: "keywords",
      severity: "Medium",
      ownerTeam: { nameEn: "Payroll & Compensation" },
      suggestedActionEn: "Escalate to the compensation committee.",
      restatementEn:
        "Flags allowance_change transactions over 15,000 where no approver is grade 10 or above.",
    });
    expect(draft?.parameters.map((item) => [item.name, item.value, item.editedByAdmin])).toEqual([
      ["types", ["allowance_change"], false],
      ["amount_limit", 15000, true],
      ["min_approver_grade", 10, false],
    ]);
    expect(draft?.check?.parameters).toEqual(draft?.parameters);
    const events = await t.dataSource.query(
      "SELECT before, after FROM audit_events WHERE action = 'rule.draft_update'",
    );
    expect(events).toHaveLength(1);
    expect(events[0].before.values.amount_limit).toBe(10000);
    expect(events[0].after.values.amount_limit).toBe(15000);
  });

  it("lets an admin choose the check type for a draft that failed", async () => {
    const written = await admin
      .post("/api/v1/rules")
      .set(CSRF)
      .send({ text: "Treat colleagues with respect." })
      .expect(201);
    const failed = (written.body as RuleResponse).rule;
    const response = await edit(
      failed.id,
      draftEdit(failed.rowVersion, { preset: "requester_not_approver", values: { types: null } }),
    ).expect(200);
    expect((response.body as RuleResponse).rule.versions[0]).toMatchObject({
      status: "draft",
      preset: "requester_not_approver",
      draftedBy: "admin",
      draftError: null,
      parameters: [{ name: "types", type: "string[]", value: null, editedByAdmin: true }],
    });
  });

  it("refuses an edit made on a stale copy, values that don't fit, and unknown teams", async () => {
    const stale = await edit("R-01", draftEdit(1)).expect(409);
    expect(stale.body).toEqual({ code: "rule_changed", params: {} });
    const invalid = await edit(
      "R-01",
      draftEdit(2, { values: { ...R01, amount_limit: -5 } }),
    ).expect(400);
    expect(invalid.body).toEqual({
      code: "validation_failed",
      params: { issues: [{ path: "values.amount_limit", code: "custom", message: "too_small" }] },
    });
    const team = await edit(
      "R-01",
      draftEdit(2, { ownerTeamId: "00000000-0000-4000-8000-000000000000" }),
    ).expect(400);
    expect(team.body.code).toBe("team_not_found");
    expect((await edit("R-99", draftEdit(1)).expect(404)).body.code).toBe("not_found");
    const unchanged = (await admin.get("/api/v1/rules/R-01").expect(200)).body.rule as Rule;
    expect(unchanged.rowVersion).toBe(2);
    expect(
      unchanged.versions[0]?.parameters.find((item) => item.name === "amount_limit")?.value,
    ).toBe(15000);
  });

  it("keeps criteria only on judgment rules, and an edit of the approved version copies them", async () => {
    const criteria = {
      meets: ["Names a concrete reason, such as a promotion or a market adjustment."],
      doesNotMeet: ["A placeholder, or a pointer to an email or memo."],
    };
    const r07 = ((await admin.get("/api/v1/rules/R-07").expect(200)).body as RuleResponse).rule;
    const judged = (
      await edit(
        "R-07",
        draftEdit(r07.rowVersion, {
          preset: "text_judgment",
          values: { types: ["pay_change"], text_field: "justification", amount_over: 5000 },
          severity: "Medium",
          criteria,
        }),
      ).expect(200)
    ).body as RuleResponse;
    expect(judged.rule.versions[0]?.criteria).toEqual(criteria);
    const [event] = await t.dataSource.query(
      "SELECT after FROM audit_events WHERE action = 'rule.draft_update' AND object_id = 'R-07'",
    );
    expect(event.after.criteria).toEqual(criteria);

    // Another check type keeps none.
    const r04 = ((await admin.get("/api/v1/rules/R-04").expect(200)).body as RuleResponse).rule;
    const draft = r04.versions[0];
    const other = (
      await edit("R-04", {
        rowVersion: r04.rowVersion,
        preset: draft?.preset,
        values: Object.fromEntries(
          (draft?.parameters ?? []).map((item) => [item.name, item.value]),
        ),
        severity: draft?.severity,
        ownerTeamId: null,
        suggestedActionEn: draft?.suggestedActionEn,
        suggestedActionAr: draft?.suggestedActionAr,
        criteria,
      }).expect(200)
    ).body as RuleResponse;
    expect(other.rule.versions[0]?.criteria).toBeNull();

    // Approved, then opened for an edit: the new version keeps the list.
    await admin
      .post("/api/v1/rules/R-07/approve")
      .set(CSRF)
      .send({ rowVersion: judged.rule.rowVersion })
      .expect(200);
    const live = ((await admin.get("/api/v1/rules/R-07").expect(200)).body as RuleResponse).rule;
    const opened = (
      await admin
        .post("/api/v1/rules/R-07/edit")
        .set(CSRF)
        .send({ rowVersion: live.rowVersion })
        .expect(200)
    ).body as RuleResponse;
    expect(opened.rule.versions[0]?.criteria).toEqual(criteria);
  });

  it("lets only admins preview and edit drafts", async () => {
    const analyst = await signIn(t, "omar.siddiqui@emirates.test");
    await analyst
      .post("/api/v1/rules/preview")
      .set(CSRF)
      .send({ preset: "approver_min_grade", values: R01 })
      .expect(403);
    await analyst.patch("/api/v1/rules/R-01/draft").set(CSRF).send(draftEdit(2)).expect(403);
  });
});
