import type { MigrationInterface, QueryRunner } from "typeorm";

const TABLES = ["policy_uploads", "rules", "rule_versions"];
const OPEN = "('draft', 'needs_data', 'draft_failed')";

/**
 * Rules, every version of their checks, and the policy uploads they were cut from. Versions are
 * never deleted; the database allows one live version and one open draft per rule.
 */
export class Rules1792281600000 implements MigrationInterface {
  name = "Rules1792281600000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE policy_uploads (
        id uuid PRIMARY KEY,
        filename text NOT NULL,
        size_bytes integer NOT NULL CHECK (size_bytes >= 0),
        sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
        rules_found integer NOT NULL CHECK (rules_found >= 0),
        warnings jsonb NOT NULL DEFAULT '[]',
        uploaded_by uuid NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`
      CREATE TABLE rules (
        id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'),
        title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
        row_version integer NOT NULL DEFAULT 1 CHECK (row_version >= 1),
        created_by uuid NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    // check_definition: CHECK is an SQL keyword.
    await queryRunner.query(`
      CREATE TABLE rule_versions (
        rule_id text NOT NULL REFERENCES rules(id),
        version integer NOT NULL CHECK (version >= 1),
        status text NOT NULL CHECK (
          status IN ('draft', 'needs_data', 'draft_failed', 'active', 'rejected', 'retired')
        ),
        source_text text NOT NULL CHECK (char_length(source_text) >= 1),
        policy_upload_id uuid REFERENCES policy_uploads(id),
        preset text,
        parameters jsonb NOT NULL DEFAULT '[]',
        check_definition jsonb,
        needs jsonb NOT NULL DEFAULT '[]',
        restatement_en text,
        restatement_ar text,
        severity text NOT NULL CHECK (severity IN ('High', 'Medium', 'Low')),
        owner_team_id uuid REFERENCES teams(id),
        suggested_action_en text NOT NULL CHECK (char_length(suggested_action_en) BETWEEN 1 AND 300),
        suggested_action_ar text NOT NULL CHECK (char_length(suggested_action_ar) BETWEEN 1 AND 300),
        drafted_by text NOT NULL CHECK (drafted_by IN ('keywords', 'admin')),
        draft_error text CHECK (draft_error IN ('no_match')),
        dataset_id uuid REFERENCES datasets(id),
        created_by uuid NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        approved_by uuid REFERENCES users(id),
        approved_at timestamptz,
        closed_by uuid REFERENCES users(id),
        closed_at timestamptz,
        reason text CHECK (char_length(reason) BETWEEN 1 AND 500),
        closed_for text CHECK (closed_for IN ('policy_reupload', 'replaced', 'rule_retired')),
        PRIMARY KEY (rule_id, version),
        CONSTRAINT rule_versions_check_present CHECK (
          CASE status
            WHEN 'draft' THEN preset IS NOT NULL AND check_definition IS NOT NULL
            WHEN 'active' THEN preset IS NOT NULL AND check_definition IS NOT NULL
            WHEN 'needs_data' THEN preset IS NOT NULL AND check_definition IS NULL
            WHEN 'draft_failed' THEN check_definition IS NULL AND draft_error IS NOT NULL
            ELSE true
          END
        ),
        CONSTRAINT rule_versions_approved CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
        CONSTRAINT rule_versions_active_approved CHECK (status <> 'active' OR approved_at IS NOT NULL),
        CONSTRAINT rule_versions_closed CHECK (
          (status IN ('rejected', 'retired')) = (closed_at IS NOT NULL)
          AND (closed_by IS NULL) = (closed_at IS NULL)
        ),
        CONSTRAINT rule_versions_closed_why CHECK (
          status NOT IN ('rejected', 'retired') OR ((reason IS NULL) <> (closed_for IS NULL))
        )
      )`);
    await queryRunner.query(
      "CREATE UNIQUE INDEX rule_versions_one_active ON rule_versions(rule_id) WHERE status = 'active'",
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX rule_versions_one_open ON rule_versions(rule_id) WHERE status IN ${OPEN}`,
    );
    // Row-level security without policies, like every other table. Supabase's API roles get no
    // grants: the datasets migration revoked the default privileges for later tables.
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
