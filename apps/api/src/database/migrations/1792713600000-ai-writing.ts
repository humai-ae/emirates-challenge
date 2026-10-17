import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * What AI adds to runs and flags:
 * - judgment texts can wait in `run_results` for AI, with its judgment kept;
 * - flags keep their standard wording beside what is shown, where each language's text came from,
 *   whether AI is writing it, and an AI judgment's confidence and detail;
 * - `ai_cache` keeps Jev's answers about each text, so an identical text is judged once.
 */
export class AiWriting1792713600000 implements MigrationInterface {
  name = "AiWriting1792713600000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE run_results DROP CONSTRAINT run_results_outcome_check");
    await queryRunner.query(
      "ALTER TABLE run_results ADD CONSTRAINT run_results_outcome_check CHECK (outcome IN ('flagged', 'could_not_check', 'needs_judgment'))",
    );
    await queryRunner.query("ALTER TABLE run_results ADD COLUMN judgment jsonb");

    await queryRunner.query(
      "ALTER TABLE flags RENAME COLUMN explanation_source TO explanation_source_en",
    );
    await queryRunner.query(`
      ALTER TABLE flags
        ADD COLUMN explanation_source_ar text NOT NULL DEFAULT 'template'
          CHECK (explanation_source_ar IN ('template', 'ai')),
        ADD COLUMN writing text NOT NULL DEFAULT 'none'
          CHECK (writing IN ('none', 'pending', 'done', 'failed')),
        ADD COLUMN standard_explanation_en text,
        ADD COLUMN standard_explanation_ar text,
        ADD COLUMN standard_fix_en text,
        ADD COLUMN standard_fix_ar text,
        ADD COLUMN confidence text CHECK (confidence IN ('High', 'Medium', 'Low')),
        ADD COLUMN judgment jsonb`);
    await queryRunner.query(`
      UPDATE flags SET standard_explanation_en = explanation_en,
        standard_explanation_ar = explanation_ar, standard_fix_en = suggested_fix_en,
        standard_fix_ar = suggested_fix_ar`);
    await queryRunner.query(`
      ALTER TABLE flags
        ALTER COLUMN standard_explanation_en SET NOT NULL,
        ALTER COLUMN standard_explanation_ar SET NOT NULL,
        ALTER COLUMN standard_fix_en SET NOT NULL,
        ALTER COLUMN standard_fix_ar SET NOT NULL,
        ADD CONSTRAINT flags_judgment CHECK ((kind = 'ai_judgment') = (judgment IS NOT NULL))`);

    await queryRunner.query(`
      CREATE TABLE ai_cache (
        key text PRIMARY KEY CHECK (key ~ '^[0-9a-f]{64}$'),
        kind text NOT NULL CHECK (kind IN ('judgment')),
        response jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    // Row-level security without policies, like every other table.
    await queryRunner.query("ALTER TABLE ai_cache ENABLE ROW LEVEL SECURITY");
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE ai_cache");
    await queryRunner.query(`
      ALTER TABLE flags
        DROP CONSTRAINT flags_judgment,
        DROP COLUMN judgment, DROP COLUMN confidence,
        DROP COLUMN standard_fix_ar, DROP COLUMN standard_fix_en,
        DROP COLUMN standard_explanation_ar, DROP COLUMN standard_explanation_en,
        DROP COLUMN writing, DROP COLUMN explanation_source_ar`);
    await queryRunner.query(
      "ALTER TABLE flags RENAME COLUMN explanation_source_en TO explanation_source",
    );
    await queryRunner.query("DELETE FROM run_results WHERE outcome = 'needs_judgment'");
    await queryRunner.query("ALTER TABLE run_results DROP COLUMN judgment");
    await queryRunner.query("ALTER TABLE run_results DROP CONSTRAINT run_results_outcome_check");
    await queryRunner.query(
      "ALTER TABLE run_results ADD CONSTRAINT run_results_outcome_check CHECK (outcome IN ('flagged', 'could_not_check'))",
    );
  }
}
