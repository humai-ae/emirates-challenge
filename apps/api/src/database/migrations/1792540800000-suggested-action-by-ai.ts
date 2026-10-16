import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Suggested fixes are written by whichever text model is set up, so a version records "ai" rather
 * than "claude".
 */
export class SuggestedActionByAi1792540800000 implements MigrationInterface {
  name = "SuggestedActionByAi1792540800000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE rule_versions
         SET draft_meta = jsonb_set(draft_meta, '{suggestedActionBy}', '"ai"')
       WHERE draft_meta->>'suggestedActionBy' = 'claude'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE rule_versions
         SET draft_meta = jsonb_set(draft_meta, '{suggestedActionBy}', '"claude"')
       WHERE draft_meta->>'suggestedActionBy' = 'ai'`);
  }
}
