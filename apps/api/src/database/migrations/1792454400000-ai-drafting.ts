import type { MigrationInterface, QueryRunner } from "typeorm";

const CHECK_PRESENT = (withDrafting: boolean) => `
  CASE status
    ${withDrafting ? "WHEN 'drafting' THEN check_definition IS NULL AND draft_error IS NULL" : ""}
    WHEN 'draft' THEN preset IS NOT NULL AND check_definition IS NOT NULL
    WHEN 'active' THEN preset IS NOT NULL AND check_definition IS NOT NULL
    WHEN 'needs_data' THEN preset IS NOT NULL AND check_definition IS NULL
    WHEN 'draft_failed' THEN check_definition IS NULL AND draft_error IS NOT NULL
    ELSE true
  END`;

/**
 * Drafting in the background: versions waiting for AI (`drafting`), drafts AI made and how, rules
 * someone asked for, owner teams a policy names, who owns each transaction type, and the routing
 * a run used.
 */
export class AiDrafting1792454400000 implements MigrationInterface {
  name = "AiDrafting1792454400000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rule_versions
        DROP CONSTRAINT rule_versions_status_check,
        ADD CONSTRAINT rule_versions_status_check CHECK (
          status IN ('drafting', 'draft', 'needs_data', 'draft_failed', 'active', 'rejected', 'retired')
        ),
        DROP CONSTRAINT rule_versions_drafted_by_check,
        ADD CONSTRAINT rule_versions_drafted_by_check CHECK (drafted_by IN ('ai', 'keywords', 'admin')),
        DROP CONSTRAINT rule_versions_draft_error_check,
        ADD CONSTRAINT rule_versions_draft_error_check CHECK (draft_error IN ('no_match', 'incomplete')),
        DROP CONSTRAINT rule_versions_check_present,
        ADD CONSTRAINT rule_versions_check_present CHECK (${CHECK_PRESENT(true)}),
        ADD COLUMN draft_meta jsonb`);
    await queryRunner.query("DROP INDEX rule_versions_one_open");
    await queryRunner.query(
      "CREATE UNIQUE INDEX rule_versions_one_open ON rule_versions(rule_id) WHERE status IN ('drafting', 'draft', 'needs_data', 'draft_failed')",
    );
    await queryRunner.query("ALTER TABLE rules ADD COLUMN requested_by uuid REFERENCES users(id)");
    await queryRunner.query(
      "ALTER TABLE policy_uploads ADD COLUMN owner_table jsonb NOT NULL DEFAULT '[]'",
    );
    await queryRunner.query(`
      CREATE TABLE routing_rules (
        transaction_type text PRIMARY KEY CHECK (char_length(transaction_type) BETWEEN 1 AND 64),
        team_id uuid NOT NULL REFERENCES teams(id),
        set_by uuid NOT NULL REFERENCES users(id),
        set_at timestamptz NOT NULL DEFAULT now()
      )`);
    // Row-level security without policies, like every table; Supabase's API roles get no grants
    // (the datasets migration revoked the default privileges for later tables).
    await queryRunner.query("ALTER TABLE routing_rules ENABLE ROW LEVEL SECURITY");
    await queryRunner.query("ALTER TABLE runs ADD COLUMN routing jsonb NOT NULL DEFAULT '{}'");
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE runs DROP COLUMN routing");
    await queryRunner.query("DROP TABLE routing_rules");
    await queryRunner.query("ALTER TABLE policy_uploads DROP COLUMN owner_table");
    await queryRunner.query("ALTER TABLE rules DROP COLUMN requested_by");
    await queryRunner.query("DROP INDEX rule_versions_one_open");
    await queryRunner.query(
      "CREATE UNIQUE INDEX rule_versions_one_open ON rule_versions(rule_id) WHERE status IN ('draft', 'needs_data', 'draft_failed')",
    );
    await queryRunner.query(`
      ALTER TABLE rule_versions
        DROP COLUMN draft_meta,
        DROP CONSTRAINT rule_versions_check_present,
        ADD CONSTRAINT rule_versions_check_present CHECK (${CHECK_PRESENT(false)}),
        DROP CONSTRAINT rule_versions_draft_error_check,
        ADD CONSTRAINT rule_versions_draft_error_check CHECK (draft_error IN ('no_match')),
        DROP CONSTRAINT rule_versions_drafted_by_check,
        ADD CONSTRAINT rule_versions_drafted_by_check CHECK (drafted_by IN ('keywords', 'admin')),
        DROP CONSTRAINT rule_versions_status_check,
        ADD CONSTRAINT rule_versions_status_check CHECK (
          status IN ('draft', 'needs_data', 'draft_failed', 'active', 'rejected', 'retired')
        )`);
  }
}
