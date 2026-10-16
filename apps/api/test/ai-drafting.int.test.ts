import type { Rule, RuleResponse, RulesListResponse } from "@hrcc/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AI_TOKEN, decisions, type FakeAi, startFakeAi, synthetic } from "./fake-ai.js";
import { fixture, uploadPack } from "./packs.js";
import { CSRF, createTestApp, signIn, type TestApp } from "./test-app.js";
import { waitFor } from "./wait.js";

type Agent = Awaited<ReturnType<typeof signIn>>;
const pairs = (version: Rule["versions"][number] | undefined) =>
  version?.parameters.map((parameter) => [parameter.name, parameter.value]);

describe("drafting rules with AI in the background", () => {
  let t: TestApp;
  let ai: FakeAi;
  let admin: Agent;
  beforeAll(async () => {
    ai = await startFakeAi();
    t = await createTestApp({
      AI_SERVICE_URL: ai.url,
      AI_SERVICE_TOKEN: AI_TOKEN,
      JOBS_POLL_SECONDS: "0.5",
      DRAFT_RETRY_LIMIT: "1",
    });
    admin = await signIn(t, "layla.haddad@emirates.test");
    await uploadPack(admin);
    // Allowance changes belong to Payroll & Compensation.
    await t.dataSource.query(`
      INSERT INTO routing_rules (transaction_type, team_id, set_by)
      SELECT 'allowance_change', team.id, admin.id FROM teams team, users admin
      WHERE team.name_en = 'Payroll & Compensation' AND admin.email = 'layla.haddad@emirates.test'`);
  });
  afterAll(async () => {
    await t.close();
    await ai.close();
  });

  const list = async () => (await admin.get("/api/v1/rules").expect(200)).body as RulesListResponse;
  const rule = async (id: string) =>
    ((await admin.get(`/api/v1/rules/${id}`).expect(200)).body as RuleResponse).rule;
  const settled = () =>
    waitFor(async () =>
      (await list()).rules.every((item) =>
        item.versions.every((version) => version.status !== "drafting"),
      ),
    );
  const write = async (text: string) =>
    ((await admin.post("/api/v1/rules").set(CSRF).send({ text }).expect(201)).body as RuleResponse)
      .rule;
  const draftRequests = (since: number) =>
    ai.received.slice(since).filter((request) => request.path === "/v1/rules/draft");

  it("drafts each uploaded rule in the background with AI, and shows the progress", async () => {
    const upload = await admin
      .post("/api/v1/policies")
      .set(CSRF)
      .attach("policy", fixture("policy_rules.md"), "policy_rules.md")
      .expect(201);
    expect(upload.body.upload).toMatchObject({ rulesFound: 13, drafting: true });
    const first = await list();
    expect(first.drafting?.total).toBe(13);
    expect(first.drafting?.done).toBeLessThan(13);
    await settled();
    const after = await list();
    expect(after.drafting).toBeNull();
    const r01 = after.rules.find((item) => item.id === "R-01")?.versions[0];
    expect(r01).toMatchObject({
      status: "draft",
      preset: "approver_min_grade",
      draftedBy: "ai",
      severity: "High",
      ownerTeam: { nameEn: "Payroll & Compensation" },
      suggestedActionEn: "Hold the transaction until it is approved as the rule says.",
      draftMeta: {
        ai: { model: "jev-test", questionSet: "rule-draft-v1" },
        aiProblem: null,
        suggestedActionBy: "claude",
      },
    });
    expect(pairs(r01)).toEqual([
      ["types", ["allowance_change"]],
      ["amount_limit", 10000],
      ["min_approver_grade", 10],
    ]);
    // The requester rule covers every type, so no one team owns it.
    expect(after.rules.find((item) => item.id === "R-02")?.versions[0]).toMatchObject({
      status: "draft",
      preset: "requester_not_approver",
      ownerTeam: null,
    });
    // AI found no check type for the rest: they fail visibly, for the admin to choose one.
    expect(after.rules.find((item) => item.id === "R-08")?.versions[0]).toMatchObject({
      status: "draft_failed",
      draftError: "no_match",
      draftedBy: "ai",
    });
    const audit = await admin.get("/api/v1/audit?action=rule.draft").expect(200);
    expect(audit.body.events).toHaveLength(13);
    expect(audit.body.events[0]).toMatchObject({
      actorId: "system",
      ai: { provider: "typesafe", model: "jev-test", promptVersion: "rule-draft-v1" },
    });
    expect(Object.keys(draftRequests(0)[0]?.body ?? {})).toEqual([
      "text",
      "columns",
      "candidates",
      "vocabulary",
    ]);
  });

  it("keeps an incomplete AI draft's check type and values", async () => {
    ai.draft = (request) =>
      decisions({
        presets: [{ approver_min_grade: 0.9 }, { approver_min_grade: 0.9 }],
        amount: { value: null, probability: 0.7 },
        grade: { value: request.candidates.grades[0] ?? null, probability: 0.9 },
      });
    const written = await write(
      "Allowance changes above AED 10,000 must be approved by at least one approver at Grade 10 or above.",
    );
    expect(written.versions[0]?.status).toBe("drafting");
    await settled();
    const version = (await rule(written.id)).versions[0];
    expect(version).toMatchObject({
      status: "draft_failed",
      draftError: "incomplete",
      preset: "approver_min_grade",
      check: null,
      draftedBy: "ai",
    });
    expect(pairs(version)).toEqual([
      ["types", null],
      ["amount_limit", null],
      ["min_approver_grade", 10],
    ]);
  });

  it("opens a new version of a rejected incomplete draft as incomplete, not as needing data", async () => {
    const incomplete = (await list()).rules.find(
      (item) => item.versions[0]?.draftError === "incomplete",
    );
    if (!incomplete) throw new Error("No incomplete draft to reopen");
    await admin
      .post(`/api/v1/rules/${incomplete.id}/reject`)
      .set(CSRF)
      .send({ rowVersion: incomplete.rowVersion, reason: "The amount is missing." })
      .expect(200);
    const rejected = await rule(incomplete.id);
    const reopened = await admin
      .post(`/api/v1/rules/${incomplete.id}/edit`)
      .set(CSRF)
      .send({ rowVersion: rejected.rowVersion })
      .expect(200);
    expect((reopened.body as RuleResponse).rule.versions[0]).toMatchObject({
      version: 2,
      status: "draft_failed",
      draftError: "incomplete",
      preset: "approver_min_grade",
      needs: [],
    });
  });

  it("drafts from the rule's words at once when AI isn't set up, and says so", async () => {
    ai.draft = () => "not_configured";
    const since = ai.received.length;
    const written = await write("The person who requests a transaction must not also approve it.");
    await settled();
    expect((await rule(written.id)).versions[0]).toMatchObject({
      status: "draft",
      preset: "requester_not_approver",
      draftedBy: "keywords",
      draftMeta: { ai: null, aiProblem: "not_configured" },
    });
    expect(draftRequests(since)).toHaveLength(1);
  });

  it("falls back to keywords when AI keeps failing, and says so", async () => {
    ai.draft = () => "fail";
    const since = ai.received.length;
    const written = await write("The person who requests a transaction must not also approve it.");
    await settled();
    expect((await rule(written.id)).versions[0]).toMatchObject({
      status: "draft",
      draftedBy: "keywords",
      draftMeta: { ai: null, aiProblem: "unavailable" },
    });
    // Tried, then tried once more (DRAFT_RETRY_LIMIT=1).
    expect(draftRequests(since)).toHaveLength(2);
  });

  it("drafts from the rule's words at once when the AI service refuses the request", async () => {
    ai.draft = () => "refuse";
    const since = ai.received.length;
    const written = await write("The person who requests a transaction must not also approve it.");
    await settled();
    expect((await rule(written.id)).versions[0]).toMatchObject({
      status: "draft",
      draftedBy: "keywords",
      draftMeta: { ai: null, aiProblem: "unavailable" },
    });
    // A refusal won't change on a second try, so it isn't sent again.
    expect(draftRequests(since)).toHaveLength(1);
  });

  it("drafts the new text when the policy is uploaded again mid-draft, and leaves the closed version alone", async () => {
    ai.draft = synthetic;
    const policy = (q01: string) =>
      Buffer.from(
        `# Policy\n\n## Q-01 Approvals\n${q01}\n\n## Q-02 Exit documents\nEvery exit must have a resignation letter and a clearance form attached.\n`,
      );
    ai.hold();
    await admin
      .post("/api/v1/policies")
      .set(CSRF)
      .attach(
        "policy",
        policy("The person who requests a transaction must not also approve it."),
        "policy.md",
      )
      .expect(201);
    // Q-01's first draft is now waiting on AI.
    await waitFor(() =>
      ai.received.some(
        (request) =>
          request.path === "/v1/rules/draft" &&
          String(request.body.text).startsWith("The person who requests"),
      ),
    );
    await admin
      .post("/api/v1/policies")
      .set(CSRF)
      .attach(
        "policy",
        policy(
          "Allowance changes above AED 10,000 must be approved by at least one approver at Grade 10 or above.",
        ),
        "policy.md",
      )
      .expect(201);
    ai.release();
    await settled();
    expect(
      (await rule("Q-01")).versions.map((version) => [
        version.version,
        version.status,
        version.closedFor,
        version.preset,
      ]),
    ).toEqual([
      [2, "draft", null, "approver_min_grade"],
      [1, "rejected", "policy_reupload", null],
    ]);
  });
});
