import type { MigrationInterface, QueryRunner } from "typeorm";

const TABLES = ["datasets", "dataset_files", "dataset_columns", "transactions", "employees"];

/** Uploaded datasets: the record, its files (kept in Storage), column profiles and parsed rows. */
export class Datasets1792195200000 implements MigrationInterface {
  name = "Datasets1792195200000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE datasets (
        id uuid PRIMARY KEY,
        name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
        status text NOT NULL CHECK (status IN ('ready', 'rejected', 'deleted')),
        rejection text CHECK (rejection IN ('no_transaction_id', 'no_employee_id')),
        transaction_count integer NOT NULL CHECK (transaction_count >= 0),
        employee_count integer NOT NULL CHECK (employee_count >= 0),
        period_from date,
        period_to date,
        issues jsonb NOT NULL DEFAULT '[]',
        columns_confirmed boolean NOT NULL DEFAULT false,
        created_by uuid NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT datasets_rejection_status CHECK (
          (status = 'ready' AND rejection IS NULL)
          OR (status = 'rejected' AND rejection IS NOT NULL)
          OR status = 'deleted'
        ),
        CONSTRAINT datasets_deleted_at CHECK ((status = 'deleted') = (deleted_at IS NOT NULL))
      )`);
    await queryRunner.query("CREATE INDEX datasets_created_at_idx ON datasets(created_at DESC)");
    await queryRunner.query(`
      CREATE TABLE dataset_files (
        dataset_id uuid NOT NULL REFERENCES datasets(id),
        kind text NOT NULL CHECK (kind IN ('transactions', 'employees')),
        filename text NOT NULL,
        size_bytes integer NOT NULL CHECK (size_bytes >= 0),
        sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
        storage_path text,
        PRIMARY KEY (dataset_id, kind)
      )`);
    await queryRunner.query(`
      CREATE TABLE dataset_columns (
        dataset_id uuid NOT NULL REFERENCES datasets(id),
        file text NOT NULL CHECK (file IN ('transactions', 'employees')),
        position integer NOT NULL CHECK (position >= 0),
        name text NOT NULL,
        type text NOT NULL,
        role text,
        role_confident boolean NOT NULL,
        role_confirmed boolean NOT NULL,
        profile jsonb NOT NULL,
        PRIMARY KEY (dataset_id, file, position)
      )`);
    await queryRunner.query(`
      CREATE TABLE transactions (
        dataset_id uuid NOT NULL REFERENCES datasets(id),
        row_no integer NOT NULL CHECK (row_no >= 1),
        transaction_id text,
        type text,
        employee_id text,
        effective_date date,
        data jsonb NOT NULL,
        PRIMARY KEY (dataset_id, row_no)
      )`);
    await queryRunner.query(
      "CREATE INDEX transactions_transaction_id_idx ON transactions(dataset_id, transaction_id)",
    );
    await queryRunner.query(
      "CREATE INDEX transactions_employee_id_idx ON transactions(dataset_id, employee_id)",
    );
    await queryRunner.query(`
      CREATE TABLE employees (
        dataset_id uuid NOT NULL REFERENCES datasets(id),
        row_no integer NOT NULL CHECK (row_no >= 1),
        employee_id text,
        data jsonb NOT NULL,
        PRIMARY KEY (dataset_id, row_no)
      )`);
    await queryRunner.query(
      "CREATE INDEX employees_employee_id_idx ON employees(dataset_id, employee_id)",
    );

    // Row-level security without policies, like every other table, now including TypeORM's own.
    for (const table of [...TABLES, "typeorm_migrations"]) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    }
    // Supabase grants its Data API roles every new public table, sequence and function by
    // default. Revoke what exists, and stop the default grants so later tables start closed.
    await queryRunner.query(`
      DO $$
      DECLARE
        api_role text;
      BEGIN
        FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
            EXECUTE format('REVOKE ALL ON ${[...TABLES, "typeorm_migrations"].join(", ")} FROM %I', api_role);
            EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
            EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
            EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role);
            EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', api_role);
          END IF;
        END LOOP;
      END
      $$`);
  }

  /** The revoked grants are not restored. */
  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [...TABLES].reverse()) {
      await queryRunner.query(`DROP TABLE ${table}`);
    }
    await queryRunner.query("ALTER TABLE typeorm_migrations DISABLE ROW LEVEL SECURITY");
  }
}
