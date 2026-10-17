import type { MigrationInterface, QueryRunner } from "typeorm";

const TABLES = ["second_opinions", "second_opinion_slices"];

/**
 * Jev's second opinions: only where it strongly disagrees with a rule's check, never findings.
 * Each background slice of a run is counted once, whatever order slices finish in.
 */
export class SecondOpinions1793059200000 implements MigrationInterface {
  name = "SecondOpinions1793059200000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE second_opinions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id text NOT NULL REFERENCES runs(id),
        rule_id text NOT NULL,
        rule_version integer NOT NULL CHECK (rule_version >= 1),
        row_no integer NOT NULL CHECK (row_no >= 1),
        transaction_id text,
        code text NOT NULL CHECK (code IN ('flagged', 'passed')),
        p_break double precision NOT NULL CHECK (p_break BETWEEN 0 AND 1),
        p_enough double precision NOT NULL CHECK (p_enough BETWEEN 0 AND 1),
        strength double precision NOT NULL CHECK (strength BETWEEN 0 AND 1),
        noted_by uuid REFERENCES users(id),
        noted_at timestamptz,
        review_requested_by uuid REFERENCES users(id),
        review_requested_at timestamptz,
        created_at timestamptz NOT NULL,
        UNIQUE (run_id, rule_id, row_no)
      )`);
    await queryRunner.query(
      "CREATE INDEX second_opinions_run_idx ON second_opinions(run_id, strength DESC, id)",
    );
    await queryRunner.query(
      "CREATE INDEX second_opinions_reviews_idx ON second_opinions(rule_id) WHERE review_requested_at IS NOT NULL",
    );
    await queryRunner.query(`
      CREATE TABLE second_opinion_slices (
        run_id text NOT NULL REFERENCES runs(id),
        first_row integer NOT NULL,
        failed boolean NOT NULL DEFAULT false,
        PRIMARY KEY (run_id, first_row)
      )`);
    // Row-level security without policies, like every other table.
    for (const table of TABLES) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [...TABLES].reverse()) await queryRunner.query(`DROP TABLE ${table}`);
  }
}
