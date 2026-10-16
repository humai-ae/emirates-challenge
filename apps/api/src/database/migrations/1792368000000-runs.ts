import type { MigrationInterface, QueryRunner } from "typeorm";

const TABLES = ["finding_formats", "runs", "run_results"];

/**
 * Runs keep a snapshot of the rule versions they used, their totals, and every finding and
 * transaction that couldn't be checked; passed transactions are only counted. Finding formats keep
 * the uploaded header, its worked examples and the confirmed mapping.
 */
export class Runs1792368000000 implements MigrationInterface {
  name = "Runs1792368000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE finding_formats (
        id uuid PRIMARY KEY,
        filename text NOT NULL,
        size_bytes integer NOT NULL CHECK (size_bytes >= 0),
        sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
        columns jsonb NOT NULL,
        examples jsonb NOT NULL,
        mapping jsonb NOT NULL,
        value_formats jsonb NOT NULL,
        row_version integer NOT NULL DEFAULT 1 CHECK (row_version >= 1),
        uploaded_by uuid NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        confirmed_by uuid REFERENCES users(id),
        confirmed_at timestamptz,
        CONSTRAINT finding_formats_confirmed CHECK ((confirmed_by IS NULL) = (confirmed_at IS NULL))
      )`);
    await queryRunner.query(
      "CREATE INDEX finding_formats_created_at_idx ON finding_formats(created_at DESC)",
    );
    await queryRunner.query(`
      CREATE TABLE runs (
        id text PRIMARY KEY CHECK (id ~ '^RUN-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2,}$'),
        dataset_id uuid NOT NULL REFERENCES datasets(id),
        status text NOT NULL CHECK (status IN ('complete', 'complete_with_errors')),
        rules jsonb NOT NULL,
        totals jsonb NOT NULL,
        started_by uuid NOT NULL REFERENCES users(id),
        started_at timestamptz NOT NULL,
        finished_at timestamptz NOT NULL
      )`);
    await queryRunner.query("CREATE INDEX runs_started_at_idx ON runs(started_at DESC)");
    await queryRunner.query(`
      CREATE TABLE run_results (
        run_id text NOT NULL REFERENCES runs(id),
        seq integer NOT NULL CHECK (seq >= 1),
        rule_id text NOT NULL,
        rule_version integer NOT NULL CHECK (rule_version >= 1),
        row_no integer NOT NULL CHECK (row_no >= 1),
        transaction_id text,
        employee_id text,
        transaction_type text,
        department text,
        effective_date date,
        amount text,
        outcome text NOT NULL CHECK (outcome IN ('flagged', 'could_not_check')),
        finding_no integer CHECK (finding_no >= 1),
        evidence jsonb NOT NULL DEFAULT '[]',
        missing jsonb NOT NULL DEFAULT '[]',
        error text,
        PRIMARY KEY (run_id, seq),
        CONSTRAINT run_results_finding_no CHECK ((outcome = 'flagged') = (finding_no IS NOT NULL))
      )`);
    await queryRunner.query(
      "CREATE INDEX run_results_outcome_idx ON run_results(run_id, outcome, seq)",
    );
    // Row-level security without policies, like every other table.
    for (const table of TABLES) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [...TABLES].reverse()) {
      await queryRunner.query(`DROP TABLE ${table}`);
    }
  }
}
