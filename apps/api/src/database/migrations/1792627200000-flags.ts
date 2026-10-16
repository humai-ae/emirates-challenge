import type { MigrationInterface, QueryRunner } from "typeorm";

const TABLES = ["flags", "notices"];

/**
 * Flags carry a finding through its life: decided by an analyst, fixed by the owner team, checked
 * and closed. Each keeps what it shows (the evidence, the transaction, the people involved), so it
 * reads the same after its dataset is deleted. Notices are the in-app messages people get as flags
 * move and rule requests are decided.
 */
export class Flags1792627200000 implements MigrationInterface {
  name = "Flags1792627200000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("CREATE SEQUENCE flag_seq");
    await queryRunner.query(`
      CREATE TABLE flags (
        id text PRIMARY KEY CHECK (id ~ '^F-[0-9]{6,}$'),
        run_id text NOT NULL,
        result_seq integer NOT NULL,
        kind text NOT NULL CHECK (kind IN ('rule_break', 'ai_judgment', 'unusual_pattern')),
        status text NOT NULL CHECK (status IN
          ('with_analyst', 'dismissed', 'confirmed', 'being_fixed', 'fix_submitted', 'closed')),
        rule_id text NOT NULL,
        rule_version integer NOT NULL CHECK (rule_version >= 1),
        rule_title text NOT NULL,
        transaction_ids text[] NOT NULL,
        row_no integer NOT NULL CHECK (row_no >= 1),
        transaction_type text,
        department text,
        employee_id text,
        requester_id text,
        transaction jsonb NOT NULL,
        people jsonb NOT NULL,
        evidence jsonb NOT NULL,
        explanation_en text NOT NULL,
        explanation_ar text NOT NULL,
        explanation_source text NOT NULL DEFAULT 'template'
          CHECK (explanation_source IN ('template', 'ai')),
        suggested_fix_en text NOT NULL,
        suggested_fix_ar text NOT NULL,
        severity text NOT NULL CHECK (severity IN ('High', 'Medium', 'Low')),
        severity_rank smallint GENERATED ALWAYS AS
          (CASE severity WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END) STORED,
        severity_reasons jsonb NOT NULL,
        owner_team_id uuid REFERENCES teams(id),
        due_date date NOT NULL,
        report_to jsonb NOT NULL,
        decision jsonb,
        assignee_user_id uuid REFERENCES users(id),
        assignment jsonb,
        fix jsonb,
        verification jsonb,
        sent_back jsonb,
        seen_again jsonb NOT NULL DEFAULT '[]',
        last_changed_by text,
        row_version integer NOT NULL DEFAULT 1 CHECK (row_version >= 1),
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        FOREIGN KEY (run_id, result_seq) REFERENCES run_results(run_id, seq),
        CONSTRAINT flags_decided CHECK ((status = 'with_analyst') = (decision IS NULL)),
        CONSTRAINT flags_owner CHECK
          (status IN ('with_analyst', 'dismissed') OR owner_team_id IS NOT NULL),
        CONSTRAINT flags_assigned CHECK
          (status NOT IN ('being_fixed', 'fix_submitted', 'closed') OR assignee_user_id IS NOT NULL),
        CONSTRAINT flags_fixed CHECK (status NOT IN ('fix_submitted', 'closed') OR fix IS NOT NULL),
        CONSTRAINT flags_closed CHECK (status <> 'closed' OR verification IS NOT NULL)
      )`);
    await queryRunner.query(
      "CREATE INDEX flags_status_idx ON flags(status, severity_rank, created_at, id)",
    );
    await queryRunner.query("CREATE INDEX flags_team_idx ON flags(owner_team_id, status)");
    await queryRunner.query("CREATE INDEX flags_rule_idx ON flags(rule_id, status)");
    await queryRunner.query("CREATE INDEX flags_run_idx ON flags(run_id)");
    await queryRunner.query(
      "CREATE INDEX flags_transactions_idx ON flags USING gin (transaction_ids)",
    );
    await queryRunner.query(`
      CREATE TABLE notices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind text NOT NULL,
        params jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        read_at timestamptz
      )`);
    await queryRunner.query("CREATE INDEX notices_user_idx ON notices(user_id, created_at DESC)");
    // Row-level security without policies, like every other table.
    for (const table of TABLES) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [...TABLES].reverse()) {
      await queryRunner.query(`DROP TABLE ${table}`);
    }
    await queryRunner.query("DROP SEQUENCE flag_seq");
  }
}
