import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Runs from before AI judged texts counted a judgment rule's texts as waiting for AI without
 * keeping them, so nothing would ever finish them. They count as could-not-check instead (not as
 * AI failures: there is nothing for Retry AI checks to put back). Runs whose texts are really
 * waiting are left alone.
 */
export class OldRunsAiWaiting1792800000000 implements MigrationInterface {
  name = "OldRunsAiWaiting1792800000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE runs AS r SET
        totals = r.totals || jsonb_build_object(
          'couldNotCheck', coalesce((r.totals->>'couldNotCheck')::int, 0)
            + (r.totals->>'waitingForAi')::int,
          'waitingForAi', 0),
        rules = (
          SELECT coalesce(jsonb_agg(
            jsonb_set(
              e.rule, '{counts}',
              (e.rule->'counts') || jsonb_build_object(
                'could_not_check', coalesce((e.rule->'counts'->>'could_not_check')::int, 0)
                  + coalesce((e.rule->'counts'->>'needs_judgment')::int, 0),
                'needs_judgment', 0))
            ORDER BY e.ord), '[]'::jsonb)
          FROM jsonb_array_elements(r.rules) WITH ORDINALITY AS e(rule, ord))
      WHERE coalesce((r.totals->>'waitingForAi')::int, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM run_results AS rr WHERE rr.run_id = r.id AND rr.outcome = 'needs_judgment')`);
  }

  async down(): Promise<void> {
    // The counts moved can't be told apart from other could-not-check counts: nothing to undo.
  }
}
