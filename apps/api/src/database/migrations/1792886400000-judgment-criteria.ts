import type { MigrationInterface, QueryRunner } from "typeorm";

/** What counts for a vague judgment rule, as its admin wrote it, kept on each rule version. */
export class JudgmentCriteria1792886400000 implements MigrationInterface {
  name = "JudgmentCriteria1792886400000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE rule_versions ADD COLUMN judgment_criteria jsonb");
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE rule_versions DROP COLUMN judgment_criteria");
  }
}
