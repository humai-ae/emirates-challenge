import { RunTotalsSchema } from "@hrcc/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OldRunsAiWaiting1792800000000 } from "../src/database/migrations/1792800000000-old-runs-ai-waiting.js";
import { runWithFlags } from "./flags-setup.js";
import { createTestApp, type TestApp } from "./test-app.js";

describe("runs from before AI judged texts", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it("stop waiting for AI: their texts were never kept, so they count as could-not-check", async () => {
    const { runId } = await runWithFlags(t);
    // An older run counted judgment texts as waiting without keeping them.
    await t.dataSource.query(
      `UPDATE runs SET
         totals = jsonb_set(totals, '{waitingForAi}', '5'),
         rules = jsonb_set(rules, '{0,counts,needs_judgment}', '5')
       WHERE id = $1`,
      [runId],
    );
    // A run whose texts really are waiting stays as it is.
    const waiting = "RUN-2099-01-01-01";
    await t.dataSource.query(
      `INSERT INTO runs (id, dataset_id, status, rules, routing, totals, started_by, started_at, finished_at)
       SELECT $2, dataset_id, status, rules, routing, totals, started_by, started_at, finished_at
       FROM runs WHERE id = $1`,
      [runId, waiting],
    );
    await t.dataSource.query(
      `INSERT INTO run_results (run_id, seq, rule_id, rule_version, row_no, outcome, evidence, missing)
       VALUES ($1, 1, 'R-01', 1, 1, 'needs_judgment', '[]', '[]')`,
      [waiting],
    );
    const before = await totalsOf(waiting);

    const runner = t.dataSource.createQueryRunner();
    try {
      await new OldRunsAiWaiting1792800000000().up(runner);
    } finally {
      await runner.release();
    }

    const [old]: Array<{ totals: unknown; rules: Array<{ counts: Record<string, number> }> }> =
      await t.dataSource.query("SELECT totals, rules FROM runs WHERE id = $1", [runId]);
    const totals = RunTotalsSchema.parse(old?.totals);
    expect(totals.waitingForAi).toBe(0);
    expect(totals.aiFailed).toBe(0);
    expect(old?.rules[0]?.counts.needs_judgment).toBe(0);
    expect(totals.couldNotCheck).toBe(before.couldNotCheck + 5);
    expect(old?.rules[0]?.counts.could_not_check).toBeGreaterThanOrEqual(5);
    expect(await totalsOf(waiting)).toEqual(before);
  });

  async function totalsOf(id: string) {
    const [row]: Array<{ totals: unknown }> = await t.dataSource.query(
      "SELECT totals FROM runs WHERE id = $1",
      [id],
    );
    return RunTotalsSchema.parse(row?.totals);
  }
});
