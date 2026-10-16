import type { FlagResponse, InboxResponse, QueueResponse } from "@hrcc/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Agent, EMAILS, type FlagsFixture, runWithFlags } from "./flags-setup.js";
import { createTestApp, signIn, type TestApp } from "./test-app.js";

describe("reading flags", () => {
  let t: TestApp;
  let fx: FlagsFixture;
  let analyst: Agent;
  beforeAll(async () => {
    t = await createTestApp();
    fx = await runWithFlags(t);
    analyst = await signIn(t, EMAILS.analyst);
  }, 60_000);
  afterAll(async () => {
    await t.close();
  });

  const inbox = async (query = "") =>
    (await analyst.get(`/api/v1/flags/inbox${query}`).expect(200)).body as InboxResponse;

  it("lists the flags waiting for a decision, most severe first, then oldest", async () => {
    const page = await inbox();
    expect(page.flags.map((flag) => flag.id)).toEqual([
      "F-000001",
      "F-000002",
      "F-000003",
      "F-000004",
      "F-000005",
      "F-000006",
      "F-000007",
      "F-000008",
      "F-000010",
      "F-000011",
      "F-000012",
      "F-000013",
      "F-000009",
    ]);
    expect(page).toMatchObject({
      matching: 13,
      total: 13,
      bySeverity: { High: 12, Medium: 1, Low: 0 },
      byKind: { rule_break: 13, ai_judgment: 0, unusual_pattern: 0 },
      nextAfter: null,
      lastRun: { id: fx.runId },
    });
    expect(page.filters.rules.map((rule) => rule.id)).toEqual(["R-01", "R-02", "R-03", "R-04"]);
    expect(page.filters.teams.map((team) => team.nameEn)).toEqual([
      "Onboarding",
      "Payroll & Compensation",
    ]);
    expect(page.filters.runs).toEqual([fx.runId]);
    expect(page.flags[0]).toMatchObject({
      id: "F-000001",
      kind: "rule_break",
      status: "with_analyst",
      ruleId: "R-01",
      transactionIds: ["TX-000006"],
      severity: "High",
      ownerTeam: { nameEn: "Payroll & Compensation" },
      overdue: false,
      seenAgain: 0,
      runId: fx.runId,
    });
    expect(page.flags[0]?.explanationAr).not.toBe("");
  });

  it("filters by severity, team, rule and run, and pages with a cursor", async () => {
    expect((await inbox("?severity=Medium")).flags.map((flag) => flag.id)).toEqual(["F-000009"]);
    expect((await inbox("?teamId=none")).flags.map((flag) => flag.id)).toEqual([
      "F-000010",
      "F-000011",
      "F-000012",
      "F-000013",
      "F-000009",
    ]);
    const onboarding = await inbox(`?teamId=${fx.teams.onboarding}`);
    expect(onboarding.matching).toBe(7);
    expect(onboarding.total).toBe(13);
    expect((await inbox("?ruleId=R-01")).flags.map((flag) => flag.id)).toEqual(["F-000001"]);
    expect((await inbox(`?runId=${fx.runId}`)).matching).toBe(13);
    const first = await inbox("?limit=5");
    expect(first.flags.map((flag) => flag.id)).toEqual([
      "F-000001",
      "F-000002",
      "F-000003",
      "F-000004",
      "F-000005",
    ]);
    const second = await inbox(`?limit=5&after=${first.nextAfter}`);
    expect(second.flags.map((flag) => flag.id)).toEqual([
      "F-000006",
      "F-000007",
      "F-000008",
      "F-000010",
      "F-000011",
    ]);
    const third = await inbox(`?limit=5&after=${second.nextAfter}`);
    expect(third.flags.map((flag) => flag.id)).toEqual(["F-000012", "F-000013", "F-000009"]);
    expect(third.nextAfter).toBeNull();
    await analyst.get("/api/v1/flags/inbox?after=not-a-cursor").expect(400);
  });

  it("shows where each language's wording comes from, and keeps the standard wording", async () => {
    const { flag } = (await analyst.get("/api/v1/flags/F-000001").expect(200)).body as FlagResponse;
    expect(flag).toMatchObject({
      standardExplanationEn: flag.explanationEn,
      standardExplanationAr: flag.explanationAr,
      standardFixEn: flag.suggestedFixEn,
      standardFixAr: flag.suggestedFixAr,
    });
    expect(flag).not.toHaveProperty("explanationSource");
    const summary = (await inbox()).flags.find((item) => item.id === "F-000001");
    expect(summary?.confidence).toBeNull();
  });

  it("reads a flag with everything its page shows", async () => {
    const { flag } = (await analyst.get("/api/v1/flags/F-000001").expect(200)).body as FlagResponse;
    expect(flag).toMatchObject({
      id: "F-000001",
      ruleVersion: 1,
      textSources: { en: "template", ar: "template" },
      writing: "none",
      confidence: null,
      judgment: null,
      decision: null,
      assignment: null,
      verification: null,
      rowVersion: 1,
      allowed: ["confirm", "dismiss"],
      assignees: [],
      related: [],
      seenAgainRuns: [],
      severityReasons: [{ code: "rule_default", severity: "High" }],
      reportTo: { level: "hr_manager", band: "mid" },
    });
    expect(flag.ruleText).toContain("Allowance changes above AED 10,000");
    expect(flag.restatementEn).not.toBeNull();
    expect(flag.evidence.length).toBeGreaterThan(0);
    expect(flag.transaction[0]).toEqual({ column: "transaction_id", value: "TX-000006" });
    expect(flag.people.map((person) => person.role)).toEqual(["employee", "requester", "approver"]);
    expect(flag.suggestedFixEn).not.toBe("");
    expect(flag.teams.map((team) => team.nameEn)).toEqual(["Onboarding", "Payroll & Compensation"]);
    expect(flag.timeline.map((event) => [event.action, event.actorName])).toEqual([
      ["flag.create", "System"],
    ]);
    expect((await analyst.get("/api/v1/flags/F-999999").expect(404)).body.code).toBe("not_found");
    await analyst.get("/api/v1/flags/not-a-flag").expect(400);
  });

  it("lets admins and auditors read but not act", async () => {
    for (const email of [EMAILS.admin, EMAILS.auditor]) {
      const reader = await signIn(t, email);
      const { flag } = (await reader.get("/api/v1/flags/F-000001").expect(200))
        .body as FlagResponse;
      expect(flag.allowed).toEqual([]);
      expect(flag.teams).toEqual([]);
      await reader.get("/api/v1/flags/inbox").expect(403);
    }
  });

  it("shows a lead only their team's confirmed flags, and their queue", async () => {
    const priya = await signIn(t, EMAILS.payrollLead);
    const ahmed = await signIn(t, EMAILS.onboardingLead);
    await priya.get("/api/v1/flags/F-000001").expect(404);
    await priya.get("/api/v1/flags/inbox").expect(403);
    await analyst.get("/api/v1/flags/queue").expect(403);
    // As an analyst's confirmation would leave it.
    await t.dataSource.query(
      `UPDATE flags SET status = 'confirmed', decision = '{"action":"confirm"}' WHERE id = 'F-000001'`,
    );
    const { flag } = (await priya.get("/api/v1/flags/F-000001").expect(200)).body as FlagResponse;
    expect(flag.allowed).toEqual(["assign"]);
    expect(flag.assignees.map((person) => person.displayName)).toEqual(["Priya Nair"]);
    await ahmed.get("/api/v1/flags/F-000001").expect(404);
    const queue = (await priya.get("/api/v1/flags/queue").expect(200)).body as QueueResponse;
    expect(queue.team.nameEn).toBe("Payroll & Compensation");
    expect(queue.toFix.map((item) => item.id)).toEqual(["F-000001"]);
    expect(queue.sentBack).toEqual([]);
    expect(queue.waiting).toEqual([]);
    expect(queue.closed).toEqual([]);
    expect((await ahmed.get("/api/v1/flags/queue").expect(200)).body.toFix).toEqual([]);
  });

  it("lists the fixes waiting for an analyst's check", async () => {
    const [{ id: priyaId }]: Array<{ id: string }> = await t.dataSource.query(
      "SELECT id FROM users WHERE email = $1",
      [EMAILS.payrollLead],
    );
    await t.dataSource.query(
      `UPDATE flags SET status = 'fix_submitted', assignee_user_id = $1,
         fix = jsonb_build_object('type', 'corrected', 'note', 'Done.', 'by', 'Priya Nair', 'byId', $2::text, 'at', '2026-10-16T08:00:00.000Z')
       WHERE id = 'F-000001'`,
      [priyaId, priyaId],
    );
    const { flags } = (await analyst.get("/api/v1/flags/fix-checks").expect(200)).body as {
      flags: Array<{ id: string; fix: { type: string } | null }>;
    };
    expect(flags.map((flag) => [flag.id, flag.fix?.type])).toEqual([["F-000001", "corrected"]]);
  });
});
