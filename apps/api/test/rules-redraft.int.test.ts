import type { Rule, RuleResponse } from "@hrcc/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { uploadPack } from "./packs.js";
import { CSRF, createTestApp, signIn, type TestApp } from "./test-app.js";

type Agent = Awaited<ReturnType<typeof signIn>>;

describe("drafting a rule again", () => {
  let t: TestApp;
  let admin: Agent;
  beforeAll(async () => {
    t = await createTestApp();
    admin = await signIn(t, "layla.haddad@emirates.test");
    await uploadPack(admin);
    await admin
      .post("/api/v1/rules")
      .set(CSRF)
      .send({ text: "Pay changes above AED 5,000 must include a justification." })
      .expect(201);
  });
  afterAll(async () => {
    await t.close();
  });

  const rule = async () =>
    ((await admin.get("/api/v1/rules/W-01").expect(200)).body as RuleResponse).rule;
  const redraft = (rowVersion: number) =>
    admin.post("/api/v1/rules/W-01/redraft").set(CSRF).send({ rowVersion });

  it("drafts the open version again from its words, dropping the admin's edits", async () => {
    const before = await rule();
    const saved = await admin
      .patch("/api/v1/rules/W-01/draft")
      .set(CSRF)
      .send({
        rowVersion: before.rowVersion,
        preset: "required_field",
        values: { types: ["pay_change"], field: "justification", amount_over: 7000 },
        severity: "High",
        ownerTeamId: null,
        suggestedActionEn: "Ask for the justification.",
        suggestedActionAr: "اطلب المبرر.",
      })
      .expect(200);
    const response = await redraft((saved.body as RuleResponse).rule.rowVersion).expect(200);
    const after: Rule = (response.body as RuleResponse).rule;
    expect(after.versions).toHaveLength(1);
    expect(after.versions[0]).toMatchObject({
      version: 1,
      status: "draft",
      preset: "required_field",
      draftedBy: "keywords",
      severity: "Medium",
    });
    expect(
      after.versions[0]?.parameters.find((parameter) => parameter.name === "amount_over"),
    ).toMatchObject({
      value: 5000,
      editedByAdmin: false,
    });
    const audit = await admin.get("/api/v1/audit?action=rule.redraft").expect(200);
    expect(audit.body.events[0]).toMatchObject({ objectId: "W-01", actorName: "Layla Haddad" });
  });

  it("refuses a stale copy, and a rule with no draft open", async () => {
    const current = await rule();
    expect((await redraft(current.rowVersion - 1).expect(409)).body.code).toBe("rule_changed");
    await admin
      .post("/api/v1/rules/W-01/approve")
      .set(CSRF)
      .send({ rowVersion: current.rowVersion })
      .expect(200);
    expect((await redraft((await rule()).rowVersion).expect(409)).body.code).toBe("rule_not_open");
  });
});
