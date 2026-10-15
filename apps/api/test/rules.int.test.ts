import {
  MAX_POLICY_BYTES,
  type PolicyUploadResponse,
  type Rule,
  type RuleResponse,
  type RulesListResponse,
} from "@hrcc/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixture, mappingOf, uploadPack } from "./packs.js";
import { CSRF, createTestApp, signIn, type TestApp } from "./test-app.js";

type Agent = Awaited<ReturnType<typeof signIn>>;
const POLICY = fixture("policy_rules.md");

function uploadPolicy(agent: Agent, file: Buffer, filename = "policy_rules.md") {
  return agent.post("/api/v1/policies").set(CSRF).attach("policy", file, filename);
}

const latest = (rule: Rule) => rule.versions[0];

describe("rules", () => {
  let t: TestApp;
  let admin: Agent;
  let datasetId: string;
  beforeAll(async () => {
    t = await createTestApp();
    admin = await signIn(t, "layla.haddad@emirates.test");
  });
  afterAll(async () => {
    await t.close();
  });

  async function rules(): Promise<Rule[]> {
    const response = await admin.get("/api/v1/rules").expect(200);
    return (response.body as RulesListResponse).rules;
  }

  async function rule(id: string): Promise<Rule> {
    const response = await admin.get(`/api/v1/rules/${id}`).expect(200);
    return (response.body as RuleResponse).rule;
  }

  it("needs data loaded before it can draft", async () => {
    const policy = await uploadPolicy(admin, POLICY).expect(409);
    expect(policy.body).toEqual({ code: "no_dataset", params: {} });
    const written = await admin
      .post("/api/v1/rules")
      .set(CSRF)
      .send({ text: "The person who requests a transaction must not also approve it." })
      .expect(409);
    expect(written.body.code).toBe("no_dataset");
    const list = await admin.get("/api/v1/rules").expect(200);
    expect(list.body).toEqual({ rules: [], dataset: null });
  });

  it("refuses files that aren't a UTF-8 policy, and creates nothing", async () => {
    const missing = await admin.post("/api/v1/policies").set(CSRF).expect(400);
    expect(missing.body).toEqual({ code: "file_missing", params: { file: "policy" } });
    const pdf = await uploadPolicy(admin, POLICY, "policy.pdf").expect(400);
    expect(pdf.body).toEqual({ code: "file_type_not_allowed", params: { file: "policy" } });
    const latin1 = await uploadPolicy(admin, Buffer.from([0x52, 0xe9, 0x0a]), "policy.md").expect(
      400,
    );
    expect(latin1.body).toEqual({
      code: "file_unreadable",
      params: { file: "policy", reason: "not_utf8" },
    });
    const empty = await uploadPolicy(admin, Buffer.from(" \n\n"), "policy.txt").expect(400);
    expect(empty.body.params).toEqual({ file: "policy", reason: "empty" });
    const big = await uploadPolicy(
      admin,
      Buffer.alloc(MAX_POLICY_BYTES + 1, "a"),
      "policy.md",
    ).expect(413);
    expect(big.body).toEqual({ code: "file_too_large", params: {} });
    expect(await rules()).toEqual([]);
  });

  it("drafts every rule of the synthetic policy without AI", async () => {
    datasetId = (await uploadPack(admin)).id;
    const response = await uploadPolicy(admin, POLICY).expect(201);
    const { upload } = response.body as PolicyUploadResponse;
    expect(upload).toMatchObject({
      filename: "policy_rules.md",
      rulesFound: 8,
      created: ["R-01", "R-02", "R-03", "R-04", "R-05", "R-06", "R-07", "R-08"],
      changed: [],
      unchanged: [],
      warnings: [],
    });
    const drafted = Object.fromEntries(
      (await rules()).map((item) => [item.id, [latest(item)?.status, latest(item)?.preset]]),
    );
    expect(drafted).toEqual({
      "R-01": ["draft", "approver_min_grade"],
      "R-02": ["draft", "requester_not_approver"],
      "R-03": ["draft", "documents_present"],
      "R-04": ["draft", "approved_by_effective"],
      "R-05": ["draft", "max_count_in_window"],
      "R-06": ["draft", "required_field"],
      "R-07": ["draft", "text_judgment"],
      "R-08": ["draft", "submitted_within_after_effective"],
    });
    const first = await rule("R-01");
    expect(first).toMatchObject({ title: "Approval of large allowance changes", rowVersion: 1 });
    expect(first.versions).toHaveLength(1);
    expect(latest(first)).toMatchObject({
      version: 1,
      sourceText:
        "Allowance changes above AED 10,000 must be approved by at least one approver at Grade 10 or above.",
      draftedBy: "keywords",
      draftError: null,
      restatementEn:
        "Flags allowance_change transactions over 10,000 where no approver is grade 10 or above.",
      severity: "High",
      ownerTeam: null,
      suggestedActionEn:
        "Get approval from an approver at the required grade, or reverse the change.",
      createdBy: "Layla Haddad",
      approvedAt: null,
    });
    expect(latest(first)?.check?.preset).toBe("approver_min_grade");
    const events = await t.dataSource.query(
      "SELECT object_type, after FROM audit_events WHERE action = 'policy.upload'",
    );
    expect(events).toHaveLength(1);
    expect(events[0].object_type).toBe("policy_upload");
    expect(events[0].after.created).toHaveLength(8);
  });

  it("leaves unchanged rules alone and opens a new draft for a changed one", async () => {
    const edited = Buffer.from(
      POLICY.toString("utf8").replace("at most 2 allowance changes", "at most 3 allowance changes"),
    );
    const response = await uploadPolicy(admin, edited, "policy_rules_v2.md").expect(201);
    expect((response.body as PolicyUploadResponse).upload).toMatchObject({
      created: [],
      changed: ["R-05"],
      unchanged: ["R-01", "R-02", "R-03", "R-04", "R-06", "R-07", "R-08"],
    });
    const changed = await rule("R-05");
    expect(changed.rowVersion).toBe(2);
    expect(changed.versions.map((version) => [version.version, version.status])).toEqual([
      [2, "draft"],
      [1, "rejected"],
    ]);
    expect(changed.versions[0]?.parameters.find((item) => item.name === "max_count")?.value).toBe(
      3,
    );
    expect(changed.versions[1]).toMatchObject({
      closedBy: "Layla Haddad",
      closedFor: "policy_reupload",
      reason: null,
    });
    const untouched = await rule("R-01");
    expect(untouched.rowVersion).toBe(1);
    expect(untouched.versions).toHaveLength(1);
  });

  it("writes a rule with the next free W-NN, and fails visibly when nothing fits", async () => {
    const written = await admin
      .post("/api/v1/rules")
      .set(CSRF)
      .send({ text: "Overtime claims must not exceed AED 5,000. Claims above that need a review." })
      .expect(201);
    const overtime = (written.body as RuleResponse).rule;
    expect(overtime).toMatchObject({
      id: "W-01",
      title: "Overtime claims must not exceed AED 5,000",
    });
    expect(latest(overtime)).toMatchObject({ status: "draft", preset: "field_compare" });
    const vague = await admin
      .post("/api/v1/rules")
      .set(CSRF)
      .send({ text: "Treat colleagues with respect." })
      .expect(201);
    expect((vague.body as RuleResponse).rule.id).toBe("W-02");
    expect(latest((vague.body as RuleResponse).rule)).toMatchObject({
      status: "draft_failed",
      draftError: "no_match",
      preset: null,
      check: null,
      restatementEn: null,
      severity: "Medium",
      suggestedActionEn: "Review the transaction against the policy and correct it.",
    });
    const events = await t.dataSource.query(
      "SELECT object_id FROM audit_events WHERE action = 'rule.create' ORDER BY seq",
    );
    expect(events.map((event: { object_id: string }) => event.object_id)).toEqual(["W-01", "W-02"]);
  });

  it("marks a rule as needing data when the dataset lacks a column", async () => {
    const detail = await admin.get(`/api/v1/datasets/${datasetId}`).expect(200);
    await admin
      .patch(`/api/v1/datasets/${datasetId}/columns`)
      .set(CSRF)
      .send(mappingOf(detail.body.dataset.columns, ["approver_ids"]))
      .expect(200);
    const response = await admin
      .post("/api/v1/rules")
      .set(CSRF)
      .send({ text: "The person who requests a transaction must not also approve it." })
      .expect(201);
    expect(latest((response.body as RuleResponse).rule)).toMatchObject({
      status: "needs_data",
      preset: "requester_not_approver",
      check: null,
      needs: [{ file: "transactions", role: "approver_ids" }],
      restatementEn: "Flags transactions where the requester is also one of the approvers.",
    });
  });

  it("lets analysts and auditors read rules, and only admins change them", async () => {
    const analyst = await signIn(t, "omar.siddiqui@emirates.test");
    const auditor = await signIn(t, "daniel.mensah@emirates.test");
    const lead = await signIn(t, "priya.nair@emirates.test");
    const list = await analyst.get("/api/v1/rules").expect(200);
    expect((list.body as RulesListResponse).rules.map((item) => item.id)).toEqual([
      "R-01",
      "R-02",
      "R-03",
      "R-04",
      "R-05",
      "R-06",
      "R-07",
      "R-08",
      "W-01",
      "W-02",
      "W-03",
    ]);
    expect((list.body as RulesListResponse).dataset?.id).toBe(datasetId);
    await auditor.get("/api/v1/rules/R-01").expect(200);
    await lead.get("/api/v1/rules").expect(403);
    await analyst.post("/api/v1/rules").set(CSRF).send({ text: "Anything." }).expect(403);
    await uploadPolicy(analyst, POLICY).expect(403);
    const unknown = await admin.get("/api/v1/rules/R-99").expect(404);
    expect(unknown.body.code).toBe("not_found");
    await admin.get("/api/v1/rules/not%20an%20id").expect(400);
  });
});

describe("rules an admin wrote", () => {
  let t: TestApp;
  let admin: Agent;
  beforeAll(async () => {
    t = await createTestApp();
    admin = await signIn(t, "layla.haddad@emirates.test");
    await uploadPack(admin);
  });
  afterAll(async () => {
    await t.close();
  });

  it("are never changed by uploading a policy", async () => {
    const written = await admin
      .post("/api/v1/rules")
      .set(CSRF)
      .send({ text: "The person who requests a transaction must not also approve it." })
      .expect(201);
    expect((written.body as RuleResponse).rule.id).toBe("W-01");
    // A policy without IDs is numbered R-01, R-02: apart from the rules written here.
    const plain = Buffer.from(
      "# Policy\n\n## Exit documents\nEvery exit must have a resignation letter and a clearance form attached.\n\n## Timing\nPay changes must be approved on or before their effective date.\n",
    );
    const first = await uploadPolicy(admin, plain, "policy.md").expect(201);
    expect((first.body as PolicyUploadResponse).upload.created).toEqual(["R-01", "R-02"]);
    // A policy that uses a written rule's ID leaves that rule alone and says so.
    const clash = Buffer.from(
      "## W-01 Exit documents\nEvery exit must have a clearance form.\n\n## W-02 Timing\nPay changes must be approved before they take effect.\n",
    );
    const second = await uploadPolicy(admin, clash, "policy-w.md").expect(201);
    expect((second.body as PolicyUploadResponse).upload).toMatchObject({
      rulesFound: 2,
      created: ["W-02"],
      changed: [],
      unchanged: [],
      warnings: [{ code: "id_taken", id: "W-01", renamedTo: null }],
    });
    const kept = (await admin.get("/api/v1/rules/W-01").expect(200)).body as RuleResponse;
    expect(kept.rule).toMatchObject({
      title: "The person who requests a transaction must not also approve it",
      rowVersion: 1,
    });
    expect(kept.rule.versions).toHaveLength(1);
    const stored = await t.dataSource.query(
      "SELECT warnings FROM policy_uploads WHERE filename = 'policy-w.md'",
    );
    expect(stored[0].warnings).toEqual([{ code: "id_taken", id: "W-01", renamedTo: null }]);
  });
});
