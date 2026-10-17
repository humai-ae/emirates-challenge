import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Unusual patterns become flags. A pattern rests on several transactions rather than one run
 * result, so its flag has no result row, and keeps what code found in `pattern`.
 */
export class PatternFlags1792972800000 implements MigrationInterface {
  name = "PatternFlags1792972800000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE flags ALTER COLUMN result_seq DROP NOT NULL");
    await queryRunner.query("ALTER TABLE flags ADD COLUMN pattern jsonb");
    await queryRunner.query(`
      ALTER TABLE flags ADD CONSTRAINT flags_pattern CHECK (
        (kind = 'unusual_pattern') = (pattern IS NOT NULL)
        AND (kind = 'unusual_pattern') = (result_seq IS NULL)
      )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE flags DROP CONSTRAINT flags_pattern");
    await queryRunner.query("DELETE FROM flags WHERE kind = 'unusual_pattern'");
    await queryRunner.query("ALTER TABLE flags DROP COLUMN pattern");
    await queryRunner.query("ALTER TABLE flags ALTER COLUMN result_seq SET NOT NULL");
  }
}
