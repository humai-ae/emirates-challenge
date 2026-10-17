import { readCsv } from "@hrcc/engine";
import type {
  FlagResponse,
  RuleResponse,
  RunResponse,
  RunResultsResponse,
  RunsListResponse,
} from "@hrcc/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AI_TOKEN, defaultJudge, type FakeAi, startFakeAi } from "./fake-ai.js";
import { type Agent, confirmFormat, EMAILS, runWithJudgments } from "./flags-setup.js";
import { fixture } from "./packs.js";
import { CSRF, createTestApp, signIn, type TestApp } from "./test-app.js";
import { waitFor } from "./wait.js";

/** The run once AI has decided every text it was left. */
async function judged(admin: Agent, runId: string): Promise<RunResponse["run"]> {
  await waitFor(async () => {
    const body = (await admin.get(`/api/v1/runs/${runId}`).expect(200)).body as RunResponse;
    return body.run.totals.waitingForAi === 0;
  });
  return ((await admin.get(`/api/v1/runs/${runId}`).expect(200)).body as RunResponse).run;
}

/** Runs the checks again on the same dataset and rules. */
async function runAgain(admin: Agent): Promise<RunResponse["run"]> {
  const { run } = (await admin.post("/api/v1/runs").set(CSRF).send({}).expect(201))
    .body as RunResponse;
  return judged(admin, run.id);
}

describe("a run with a judgment rule, without AI", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it("without AI, a judgment rule's texts can't be checked", async () => {
    const { run } = await runWithJudgments(t);
    const rule = run.rules.find((item) => item.ruleId === "R-07");
    expect(run.totals.waitingForAi).toBe(0);
    expect(run.totals.aiFailed).toBeGreaterThan(0);
    expect(rule?.counts.needs_judgment).toBe(0);
    expect(rule?.counts.could_not_check).toBe(run.totals.aiFailed);
    const rows: Array<{ error: string; n: number }> = await t.dataSource.query(
      "SELECT error, count(*)::int AS n FROM run_results WHERE run_id = $1 AND rule_id = 'R-07' AND outcome = 'could_not_check' GROUP BY error",
      [run.id],
    );
    expect(rows).toEqual([{ error: "ai_not_set_up", n: run.totals.aiFailed }]);
    // Blank justifications still break the rule in code, with the standard wording.
    const flags: Array<{ kind: string; writing: string }> = await t.dataSource.query(
      "SELECT kind, writing FROM flags WHERE run_id = $1 AND rule_id = 'R-07'",
      [run.id],
    );
    expect(flags.length).toBeGreaterThan(0);
    expect(flags.every((flag) => flag.kind === "rule_break" && flag.writing === "none")).toBe(true);
  });
});

describe("a run with a judgment rule, with AI", () => {
  let t: TestApp;
  let fake: FakeAi;
  beforeAll(async () => {
    fake = await startFakeAi();
    // No text model: only the judging is under test here.
    fake.providers = { typesafe: true, textModel: false };
    t = await createTestApp({
      AI_SERVICE_URL: fake.url,
      AI_SERVICE_TOKEN: AI_TOKEN,
      JOBS_POLL_SECONDS: "0.5",
    });
  });
  afterAll(async () => {
    await t.close();
    await fake.close();
  });

  it("leaves a judgment rule's texts for AI, with the text in each result", async () => {
    const { run } = await runWithJudgments(t);
    const rule = run.rules.find((item) => item.ruleId === "R-07");
    expect(run.totals.waitingForAi).toBeGreaterThan(0);
    expect(run.totals.aiFailed).toBe(0);
    expect(rule?.counts.needs_judgment).toBe(run.totals.waitingForAi);
    const [waiting]: Array<{
      evidence: Array<{ field: string; value: string; condition: string }>;
    }> = await t.dataSource.query(
      "SELECT evidence FROM run_results WHERE run_id = $1 AND outcome = 'needs_judgment' ORDER BY seq LIMIT 1",
      [run.id],
    );
    expect(waiting?.evidence.at(-1)).toMatchObject({
      field: "justification",
      condition: "read by AI against the rule",
    });
  });
});

describe("AI judges a run's texts", () => {
  let t: TestApp;
  let fake: FakeAi;
  let admin: Agent;
  let first: RunResponse["run"];
  beforeAll(async () => {
    fake = await startFakeAi();
    fake.providers = { typesafe: true, textModel: false };
    // The first text of each request reads as a placeholder, the second Jev isn't sure about,
    // the rest are clear reasons.
    fake.judge = (request) =>
      request.items.map((item, index) => ({
        key: item.key,
        specific: index < 2 ? 0.1 : 0.9,
        placeholder: index === 0 ? 0.95 : 0.05,
        accept: index === 0 ? 0.05 : index === 1 ? 0.45 : 0.95,
        enough: 0.9,
      }));
    t = await createTestApp({
      AI_SERVICE_URL: fake.url,
      AI_SERVICE_TOKEN: AI_TOKEN,
      JOBS_POLL_SECONDS: "0.5",
    });
    const started = await runWithJudgments(t);
    admin = started.admin;
    first = await judged(admin, started.run.id);
  });
  afterAll(async () => {
    await t.close();
    await fake.close();
  });

  it("raises AI-judgment flags with a confidence, capping an unsure one at Medium", async () => {
    const flags: Array<{ confidence: string; severity: string; judgment: { decision: string } }> =
      await t.dataSource.query(
        "SELECT confidence, severity, judgment FROM flags WHERE run_id = $1 AND kind = 'ai_judgment'",
        [first.id],
      );
    expect(new Set(flags.map((flag) => flag.confidence))).toEqual(new Set(["High", "Low"]));
    for (const flag of flags.filter((item) => item.confidence === "Low")) {
      expect(flag.severity).not.toBe("High");
      expect(flag.judgment.decision).toBe("unsure");
    }
    const rule = first.rules.find((item) => item.ruleId === "R-07");
    expect(rule?.counts.needs_judgment).toBe(0);
    expect(first.totals.newFlags).toBeGreaterThan(flags.length - 1);
    const passed: Array<{ n: number }> = await t.dataSource.query(
      "SELECT count(*)::int AS n FROM run_results WHERE run_id = $1 AND outcome = 'needs_judgment'",
      [first.id],
    );
    expect(passed[0]?.n).toBe(0);
  });

  it("decides each text once per rule version, and sends only the text and its context", async () => {
    const asked = fake.received.filter((item) => item.path === "/v1/judgments/evaluate");
    const items = asked.flatMap((item) => item.body.items as Array<Record<string, unknown>>);
    const texts = items.map((item) => String(item.text).trim().toLowerCase());
    expect(texts.length).toBeGreaterThan(1);
    expect(new Set(texts).size).toBe(texts.length);
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(["amountBand", "field", "key", "text", "type"]);
    }
    // Running again on the same data asks nothing: the answers are cached.
    fake.received.length = 0;
    const again = await runAgain(admin);
    expect(fake.received.filter((item) => item.path === "/v1/judgments/evaluate")).toEqual([]);
    expect(again.totals.waitingForAi).toBe(0);
  });

  it("explains judged findings as AI's reading, and leaves unsure ones out of the scored export", async () => {
    const results = (
      await admin.get(`/api/v1/runs/${first.id}/results?outcome=flagged&ruleId=R-07`).expect(200)
    ).body as RunResultsResponse;
    const judgedResults = results.results.filter((result) =>
      result.explanationEn?.startsWith("AI read"),
    );
    expect(judgedResults.length).toBeGreaterThan(0);
    expect(judgedResults[0]?.explanationAr).toContain("الذكاء الاصطناعي");

    const unsure: Array<{ transaction_id: string }> = await t.dataSource.query(
      "SELECT transaction_id FROM run_results WHERE run_id = $1 AND judgment->>'decision' = 'unsure'",
      [first.id],
    );
    const breaks: Array<{ transaction_id: string }> = await t.dataSource.query(
      "SELECT transaction_id FROM run_results WHERE run_id = $1 AND judgment->>'decision' = 'breaks'",
      [first.id],
    );
    expect(unsure.length).toBeGreaterThan(0);
    await confirmFormat(admin);
    const csv = (await admin.get(`/api/v1/runs/${first.id}/export`).expect(200)).text;
    const read = readCsv(new TextEncoder().encode(csv));
    if (!read.ok) throw new Error(read.reason);
    const exported = new Set(read.table.rows.map((row) => `${row[1]}|${row[2]}`));
    for (const row of unsure) expect(exported.has(`${row.transaction_id}|R-07`)).toBe(false);
    for (const row of breaks) expect(exported.has(`${row.transaction_id}|R-07`)).toBe(true);
    const described = read.table.rows.find(
      (row) => row[1] === breaks[0]?.transaction_id && row[2] === "R-07",
    );
    expect(described?.[4]).toMatch(/^AI read the justification/);
  });

  it("links a judged finding to an open flag instead of raising it twice", async () => {
    const again = await runAgain(admin);
    const raised: Array<{ n: number }> = await t.dataSource.query(
      "SELECT count(*)::int AS n FROM flags WHERE run_id = $1 AND kind = 'ai_judgment'",
      [again.id],
    );
    expect(raised[0]?.n).toBe(0);
    expect(again.totals.seenAgain).toBeGreaterThan(0);
  });
});

describe("when AI keeps failing", () => {
  let t: TestApp;
  let fake: FakeAi;
  beforeAll(async () => {
    fake = await startFakeAi();
    fake.providers = { typesafe: true, textModel: false };
    fake.judge = () => "fail";
    t = await createTestApp({
      AI_SERVICE_URL: fake.url,
      AI_SERVICE_TOKEN: AI_TOKEN,
      JOBS_POLL_SECONDS: "0.5",
      JUDGE_RETRY_LIMIT: "0",
    });
  });
  afterAll(async () => {
    await t.close();
    await fake.close();
  });

  it("leaves texts could-not-check when AI keeps failing, and Retry AI checks decides them", async () => {
    const { admin, run } = await runWithJudgments(t);
    const failed = await judged(admin, run.id);
    expect(failed.totals.aiFailed).toBeGreaterThan(0);
    const count = failed.totals.aiFailed;

    // AI works again: the retry puts back only those texts and decides them.
    fake.judge = defaultJudge;
    const analyst = await signIn(t, EMAILS.analyst);
    const retried = (
      await analyst.post(`/api/v1/runs/${run.id}/retry-ai`).set(CSRF).send({}).expect(200)
    ).body as RunResponse;
    expect(retried.run.totals.waitingForAi).toBe(count);
    expect(retried.run.totals.aiFailed).toBe(0);
    const done = await judged(admin, run.id);
    expect(done.totals.aiFailed).toBe(0);
    await analyst
      .post(`/api/v1/runs/${run.id}/retry-ai`)
      .set(CSRF)
      .send({})
      .expect(409, { code: "nothing_to_retry", params: {} });
    const actions: Array<{ action: string }> = await t.dataSource.query(
      "SELECT action FROM audit_events WHERE object_id = $1 ORDER BY seq",
      [run.id],
    );
    // The run's pattern search and second opinion are background jobs of their own, so they land
    // anywhere after the start.
    const background = new Set(["run.patterns", "run.second_opinion_complete"]);
    const named = actions.map((row) => row.action);
    expect(named.filter((action) => !background.has(action))).toEqual([
      "run.start",
      "run.ai_checks",
      "run.retry_ai",
      "run.ai_checks",
    ]);
    expect(named.filter((action) => action === "run.patterns")).toHaveLength(1);
  });

  it("says the AI service isn't answering when it doesn't", async () => {
    fake.unhealthy = true;
    const admin = await signIn(t, EMAILS.admin);
    const { runs } = (await admin.get("/api/v1/runs").expect(200)).body as RunsListResponse;
    await admin
      .post(`/api/v1/runs/${runs[0]?.id ?? ""}/retry-ai`)
      .set(CSRF)
      .send({})
      .expect(409, { code: "ai_unavailable", params: {} });
    fake.unhealthy = false;
  });

  it("says Retry AI checks can't run while AI can't judge", async () => {
    fake.providers = { typesafe: false, textModel: false };
    const admin = await signIn(t, EMAILS.admin);
    const { runs } = (await admin.get("/api/v1/runs").expect(200)).body as RunsListResponse;
    await admin
      .post(`/api/v1/runs/${runs[0]?.id ?? ""}/retry-ai`)
      .set(CSRF)
      .send({})
      .expect(409, { code: "ai_not_set_up", params: {} });
    fake.providers = { typesafe: true, textModel: false };
  });
});

/** A justification that names an employee of the pack. */
const NAMING = "Replacement for E-0005 after resignation";

/** The pack's transactions, with one pay change above AED 5,000 justified by `text`. */
function justifiedBy(text: string): Buffer {
  const lines = fixture("transactions.csv").toString("utf8").split("\n");
  const index = lines.findIndex((line) => {
    const cells = line.split(",");
    return (
      cells[1] === "pay_change" && Number(cells[5]) > 5000 && (cells.at(-1) ?? "").trim() !== ""
    );
  });
  const cells = (lines[index] ?? "").split(",");
  cells[cells.length - 1] = text;
  lines[index] = cells.join(",");
  return Buffer.from(lines.join("\n"), "utf8");
}

describe("a judged text that names a person", () => {
  let t: TestApp;
  let fake: FakeAi;
  beforeAll(async () => {
    fake = await startFakeAi();
    fake.providers = { typesafe: true, textModel: false };
    t = await createTestApp({
      AI_SERVICE_URL: fake.url,
      AI_SERVICE_TOKEN: AI_TOKEN,
      JOBS_POLL_SECONDS: "0.5",
    });
  });
  afterAll(async () => {
    await t.close();
    await fake.close();
  });

  it("reaches Jev with the person's ID swapped for a token", async () => {
    const { admin, run } = await runWithJudgments(t, justifiedBy(NAMING));
    await judged(admin, run.id);
    const texts = fake.received
      .filter((item) => item.path === "/v1/judgments/evaluate")
      .flatMap((item) => (item.body.items as Array<{ text: string }>).map((entry) => entry.text));
    expect(texts.some((text) => text.includes("E-0005"))).toBe(false);
    expect(texts).toContain("Replacement for [EMP_1] after resignation");
  });
});

describe("the admin's criteria and the one-time restatement", () => {
  const criteria = {
    meets: ["Names a concrete reason, such as a promotion or a market adjustment."],
    doesNotMeet: ["A placeholder, or a pointer to an email or memo."],
  };
  /** Jev isn't sure about any text, however often it is asked. */
  const unsureJudge = (request: { items: Array<{ key: string }> }) =>
    request.items.map((item) => ({
      key: item.key,
      specific: 0.5,
      placeholder: 0.1,
      accept: 0.45,
      enough: 0.9,
    }));

  async function app(fake: FakeAi) {
    return createTestApp({
      AI_SERVICE_URL: fake.url,
      AI_SERVICE_TOKEN: AI_TOKEN,
      JOBS_POLL_SECONDS: "0.5",
    });
  }
  const sentTo = (fake: FakeAi, path: string) => fake.received.filter((item) => item.path === path);

  it("judges with the version's criteria, and asks again when they change", async () => {
    const fake = await startFakeAi();
    fake.providers = { typesafe: true, textModel: false };
    // Unsure about every text, so each raises a flag a person decides.
    fake.judge = unsureJudge;
    const t = await app(fake);
    try {
      const { admin, run } = await runWithJudgments(t, undefined, criteria);
      await judged(admin, run.id);
      const first = sentTo(fake, "/v1/judgments/evaluate");
      expect(first.length).toBeGreaterThan(0);
      for (const call of first)
        expect((call.body.rule as { criteria: unknown }).criteria).toEqual(criteria);
      // The person deciding a judgement sees what counted.
      const [judgedFlag]: Array<{ id: string }> = await t.dataSource.query(
        "SELECT id FROM flags WHERE run_id = $1 AND kind = 'ai_judgment' LIMIT 1",
        [run.id],
      );
      const analyst = await signIn(t, EMAILS.analyst);
      const { flag } = (await analyst.get(`/api/v1/flags/${judgedFlag?.id}`).expect(200))
        .body as FlagResponse;
      expect(flag.criteria).toEqual(criteria);

      // A new version with other criteria: its texts are asked again, not served from the cache.
      const changed = {
        ...criteria,
        meets: [...criteria.meets, "A correction of an earlier error."],
      };
      const live = ((await admin.get("/api/v1/rules/R-07").expect(200)).body as RuleResponse).rule;
      const opened = (
        await admin
          .post("/api/v1/rules/R-07/edit")
          .set(CSRF)
          .send({ rowVersion: live.rowVersion })
          .expect(200)
      ).body as RuleResponse;
      const draft = opened.rule.versions[0];
      const saved = (
        await admin
          .patch("/api/v1/rules/R-07/draft")
          .set(CSRF)
          .send({
            rowVersion: opened.rule.rowVersion,
            preset: "text_judgment",
            values: { types: ["pay_change"], text_field: "justification", amount_over: 5000 },
            severity: "Medium",
            ownerTeamId: null,
            suggestedActionEn: draft?.suggestedActionEn,
            suggestedActionAr: draft?.suggestedActionAr,
            criteria: changed,
          })
          .expect(200)
      ).body as RuleResponse;
      await admin
        .post("/api/v1/rules/R-07/approve")
        .set(CSRF)
        .send({ rowVersion: saved.rule.rowVersion })
        .expect(200);
      fake.received.length = 0;
      await runAgain(admin);
      const second = sentTo(fake, "/v1/judgments/evaluate");
      expect(second.length).toBeGreaterThan(0);
      for (const call of second)
        expect((call.body.rule as { criteria: unknown }).criteria).toEqual(changed);
    } finally {
      await t.close();
      await fake.close();
    }
  });

  it("restates an unsure text once and asks Jev once more, never twice", async () => {
    const fake = await startFakeAi();
    fake.providers = { typesafe: true, textModel: false };
    fake.judge = unsureJudge;
    fake.restate = (request) =>
      request.items.map((item) => ({
        key: item.key,
        restated: `The reason is ${item.text.toLowerCase()}.`,
        kind: "performance",
      }));
    const t = await app(fake);
    try {
      fake.providers = { typesafe: true, textModel: true };
      const { admin, run } = await runWithJudgments(t);
      const done = await judged(admin, run.id);
      const restated = sentTo(fake, "/v1/judgments/restate");
      const evaluated = sentTo(fake, "/v1/judgments/evaluate");
      const texts = restated.flatMap((call) =>
        (call.body.items as Array<{ text: string }>).map((item) => item.text),
      );
      expect(new Set(texts).size).toBe(texts.length);
      // First answers, then one more for each restated text: two requests for this one batch.
      expect(evaluated).toHaveLength(2);
      const second = evaluated[1]?.body.items as Array<{ clarification: { kind: string } }>;
      expect(second.every((item) => item.clarification.kind === "performance")).toBe(true);
      expect(done.totals.waitingForAi).toBe(0);
      // Still unsure after the one try: a flag for a person, with what AI restated.
      const flags: Array<{ confidence: string; judgment: { restatement: { kind: string } } }> =
        await t.dataSource.query(
          "SELECT confidence, judgment FROM flags WHERE run_id = $1 AND kind = 'ai_judgment'",
          [run.id],
        );
      expect(flags.length).toBeGreaterThan(0);
      expect(
        flags.every(
          (flag) => flag.confidence === "Low" && flag.judgment.restatement.kind === "performance",
        ),
      ).toBe(true);
      const [audit]: Array<{ ai: { output: Record<string, unknown> } }> = await t.dataSource.query(
        "SELECT ai FROM audit_events WHERE action = 'run.ai_checks' AND object_id = $1",
        [run.id],
      );
      expect(audit?.ai.output).toMatchObject({
        restated: texts.length,
        askedAgain: texts.length,
        settled: 0,
      });

      // Never twice: the next run settles from the cache, with no AI call at all.
      fake.received.length = 0;
      await runAgain(admin);
      expect(sentTo(fake, "/v1/judgments/restate")).toEqual([]);
      expect(sentTo(fake, "/v1/judgments/evaluate")).toEqual([]);
    } finally {
      await t.close();
      await fake.close();
    }
  });

  it("passes a text Jev is sure about once restated, and raises no flag for it", async () => {
    const fake = await startFakeAi();
    fake.providers = { typesafe: true, textModel: true };
    // Unsure about the text alone; sure it meets the rule once it reads the restatement.
    fake.judge = (request) =>
      request.items.map((item) =>
        item.clarification
          ? { key: item.key, specific: 0.95, placeholder: 0.02, accept: 0.95, enough: 0.95 }
          : { key: item.key, specific: 0.5, placeholder: 0.1, accept: 0.45, enough: 0.9 },
      );
    fake.restate = (request) =>
      request.items.map((item) => ({
        key: item.key,
        restated: "A raise after the annual performance review.",
        kind: "performance",
      }));
    const t = await app(fake);
    try {
      const { admin, run } = await runWithJudgments(t);
      await judged(admin, run.id);
      expect(sentTo(fake, "/v1/judgments/evaluate")).toHaveLength(2);
      const flags = await t.dataSource.query(
        "SELECT id FROM flags WHERE run_id = $1 AND kind = 'ai_judgment'",
        [run.id],
      );
      expect(flags).toEqual([]);
      const restated = sentTo(fake, "/v1/judgments/restate").flatMap(
        (call) => call.body.items as unknown[],
      );
      const [audit]: Array<{ ai: { output: Record<string, unknown> } }> = await t.dataSource.query(
        "SELECT ai FROM audit_events WHERE action = 'run.ai_checks' AND object_id = $1",
        [run.id],
      );
      expect(restated.length).toBeGreaterThan(0);
      expect(audit?.ai.output).toMatchObject({ settled: restated.length });
      // A text that passed keeps only the kind of reason, none of its wording.
      const cached: Array<{
        response: { restatement: { restated: string; kind: string } | null };
      }> = await t.dataSource.query("SELECT response FROM ai_cache");
      const kept = cached.flatMap((row) =>
        row.response.restatement ? [row.response.restatement] : [],
      );
      expect(kept.length).toBe(restated.length);
      expect(kept.every((item) => item.restated === "" && item.kind === "performance")).toBe(true);
    } finally {
      await t.close();
      await fake.close();
    }
  });

  it("restates a text that names a person with a token, and shows the person on the flag", async () => {
    const fake = await startFakeAi();
    fake.providers = { typesafe: true, textModel: true };
    fake.judge = unsureJudge;
    fake.restate = (request) =>
      request.items.map((item) => ({
        key: item.key,
        restated: `The reason is: ${item.text}`,
        kind: "retention",
      }));
    const t = await app(fake);
    try {
      const { admin, run } = await runWithJudgments(t, justifiedBy(NAMING));
      await judged(admin, run.id);
      const restated = sentTo(fake, "/v1/judgments/restate").flatMap((call) =>
        (call.body.items as Array<{ text: string }>).map((item) => item.text),
      );
      const clarified = sentTo(fake, "/v1/judgments/evaluate").flatMap((call) =>
        (call.body.items as Array<{ clarification?: { restated: string } }>).flatMap((item) =>
          item.clarification ? [item.clarification.restated] : [],
        ),
      );
      expect([...restated, ...clarified].some((text) => text.includes("E-0005"))).toBe(false);
      expect(restated).toContain("Replacement for [EMP_1] after resignation");
      expect(clarified).toContain("The reason is: Replacement for [EMP_1] after resignation");
      const flags: Array<{ judgment: { restatement: { restated: string } | null } }> =
        await t.dataSource.query(
          "SELECT judgment FROM flags WHERE run_id = $1 AND kind = 'ai_judgment'",
          [run.id],
        );
      expect(flags.map((flag) => flag.judgment.restatement?.restated)).toContain(
        `The reason is: ${NAMING}`,
      );
      // The cache keeps no one's ID: a later run puts the person back from the token.
      const cached = JSON.stringify(await t.dataSource.query("SELECT response FROM ai_cache"));
      expect(cached).not.toContain("E-0005");
      expect(cached).toContain("The reason is: Replacement for [EMP_1] after resignation");
      const again = await runAgain(admin);
      const results: Array<{ judgment: { restatement: { restated: string } | null } }> =
        await t.dataSource.query(
          "SELECT judgment FROM run_results WHERE run_id = $1 AND judgment IS NOT NULL",
          [again.id],
        );
      expect(results.map((result) => result.judgment.restatement?.restated)).toContain(
        `The reason is: ${NAMING}`,
      );
    } finally {
      await t.close();
      await fake.close();
    }
  });

  it("makes its one try on the next run when restating failed, then settles", async () => {
    const fake = await startFakeAi();
    fake.providers = { typesafe: true, textModel: true };
    fake.judge = unsureJudge;
    fake.restate = () => "fail";
    const t = await app(fake);
    try {
      const { admin, run } = await runWithJudgments(t);
      await judged(admin, run.id);
      fake.restate = (request) =>
        request.items.map((item) => ({
          key: item.key,
          restated: `The reason is: ${item.text}`,
          kind: "performance",
        }));
      fake.received.length = 0;
      await runAgain(admin);
      expect(sentTo(fake, "/v1/judgments/restate")).toHaveLength(1);
      expect(sentTo(fake, "/v1/judgments/evaluate")).toHaveLength(2);
      fake.received.length = 0;
      await runAgain(admin);
      expect(sentTo(fake, "/v1/judgments/restate")).toEqual([]);
      expect(sentTo(fake, "/v1/judgments/evaluate")).toEqual([]);
    } finally {
      await t.close();
      await fake.close();
    }
  });

  it("leaves a text whose kind is unclear for a person, and goes on when restating fails", async () => {
    const fake = await startFakeAi();
    fake.providers = { typesafe: true, textModel: true };
    fake.judge = unsureJudge;
    fake.restate = (request) =>
      request.items.map((item) => ({ key: item.key, restated: "", kind: "unclear" }));
    const t = await app(fake);
    try {
      const { admin, run } = await runWithJudgments(t);
      await judged(admin, run.id);
      expect(sentTo(fake, "/v1/judgments/restate").length).toBeGreaterThan(0);
      expect(sentTo(fake, "/v1/judgments/evaluate")).toHaveLength(1);
    } finally {
      await t.close();
      await fake.close();
    }
    const failing = await startFakeAi();
    failing.providers = { typesafe: true, textModel: true };
    failing.judge = unsureJudge;
    failing.restate = () => "fail";
    const t2 = await app(failing);
    try {
      const { admin, run } = await runWithJudgments(t2);
      const done = await judged(admin, run.id);
      expect(done.totals.aiFailed).toBe(0);
      expect(sentTo(failing, "/v1/judgments/evaluate")).toHaveLength(1);
    } finally {
      await t2.close();
      await failing.close();
    }
  });
});
