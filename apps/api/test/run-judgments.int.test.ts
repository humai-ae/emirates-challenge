import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AI_TOKEN, type FakeAi, startFakeAi } from "./fake-ai.js";
import { runWithJudgments } from "./flags-setup.js";
import { createTestApp, type TestApp } from "./test-app.js";

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
    t = await createTestApp({ AI_SERVICE_URL: fake.url, AI_SERVICE_TOKEN: AI_TOKEN });
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
