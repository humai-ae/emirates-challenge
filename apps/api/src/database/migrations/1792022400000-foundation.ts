import type { MigrationInterface, QueryRunner } from "typeorm";

export class Foundation1792022400000 implements MigrationInterface {
  name = "Foundation1792022400000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE teams (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name_en text NOT NULL UNIQUE,
        name_ar text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        username text NOT NULL UNIQUE,
        display_name text NOT NULL,
        role text NOT NULL CHECK (role IN ('admin', 'analyst', 'lead', 'auditor')),
        locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'ar')),
        team_id uuid REFERENCES teams(id),
        is_demo boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT lead_has_team CHECK (role <> 'lead' OR team_id IS NOT NULL)
      )`);
    await queryRunner.query(`
      CREATE TABLE sessions (
        id text PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL
      )`);
    await queryRunner.query("CREATE INDEX sessions_user_id_idx ON sessions(user_id)");
    await queryRunner.query("CREATE SEQUENCE audit_events_seq");
    await queryRunner.query(`
      CREATE TABLE audit_events (
        seq bigint PRIMARY KEY,
        event_id text NOT NULL UNIQUE,
        at timestamptz NOT NULL,
        actor_id text NOT NULL,
        actor_name text NOT NULL,
        role text NOT NULL,
        action text NOT NULL,
        object_type text NOT NULL,
        object_id text NOT NULL,
        before jsonb,
        after jsonb,
        reason text,
        ai jsonb,
        prev_hash text NOT NULL,
        hash text NOT NULL
      )`);
    await queryRunner.query(
      "CREATE INDEX audit_events_object_idx ON audit_events(object_type, object_id)",
    );
    await queryRunner.query("CREATE INDEX audit_events_actor_idx ON audit_events(actor_id)");
    await queryRunner.query(`
      CREATE FUNCTION audit_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'audit_events is append-only';
      END
      $$`);
    await queryRunner.query(`
      CREATE TRIGGER audit_events_no_update_delete
      BEFORE UPDATE OR DELETE ON audit_events
      FOR EACH ROW EXECUTE FUNCTION audit_events_append_only()`);
    await queryRunner.query(`
      CREATE TRIGGER audit_events_no_truncate
      BEFORE TRUNCATE ON audit_events
      FOR EACH STATEMENT EXECUTE FUNCTION audit_events_append_only()`);

    // Supabase exposes public tables through its Data API. Row-level security with no
    // policies, plus revoking the API roles, keeps every row out of it. The app connects
    // as the table owner, which bypasses RLS.
    for (const table of ["teams", "users", "sessions", "audit_events"]) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    }
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          REVOKE ALL ON teams, users, sessions, audit_events FROM anon;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          REVOKE ALL ON teams, users, sessions, audit_events FROM authenticated;
        END IF;
      END
      $$`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE audit_events");
    await queryRunner.query("DROP FUNCTION audit_events_append_only()");
    await queryRunner.query("DROP SEQUENCE audit_events_seq");
    await queryRunner.query("DROP TABLE sessions");
    await queryRunner.query("DROP TABLE users");
    await queryRunner.query("DROP TABLE teams");
  }
}
