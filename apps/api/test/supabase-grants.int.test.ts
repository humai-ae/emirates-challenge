import pg from "pg";
import { DataSource } from "typeorm";
import { describe, expect, it } from "vitest";
import { dataSourceOptions } from "../src/database/options.js";
import { createTestDatabase } from "./test-app.js";

describe("Supabase Data API exposure", () => {
  it("leaves Supabase's API roles without access to any table or sequence, including later ones", async () => {
    const url = await createTestDatabase();
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    // Recreate what Supabase does: API roles exist and get default privileges on new public tables.
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    END $$`);
    await client.query(
      "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated",
    );
    await client.query(
      "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated",
    );
    await client.end();

    const dataSource = new DataSource(
      dataSourceOptions({ DATABASE_URL: url, DATABASE_SSL: "disable", DATABASE_SSL_CA: undefined }),
    );
    await dataSource.initialize();
    try {
      await dataSource.runMigrations();
      // A table a later migration might add, created by the same owner.
      await dataSource.query("CREATE TABLE created_later (id integer)");
      const tables = [
        "ai_cache",
        "audit_events",
        "created_later",
        "dataset_columns",
        "dataset_files",
        "datasets",
        "employees",
        "finding_formats",
        "flags",
        "notices",
        "policy_uploads",
        "routing_rules",
        "rule_versions",
        "rules",
        "run_results",
        "runs",
        "sessions",
        "teams",
        "transactions",
        "typeorm_migrations",
        "users",
      ];
      const rows: Array<{ name: string; anon: boolean; authenticated: boolean }> =
        await dataSource.query(
          `SELECT name,
                  has_table_privilege('anon', name, 'SELECT,INSERT') AS anon,
                  has_table_privilege('authenticated', name, 'SELECT,INSERT') AS authenticated
           FROM unnest($1::text[]) AS name
           ORDER BY name COLLATE "C"`,
          [tables],
        );
      expect(rows).toEqual(tables.map((name) => ({ name, anon: false, authenticated: false })));
      const sequences: Array<{ anon: boolean }> = await dataSource.query(
        "SELECT has_sequence_privilege('anon', 'audit_events_seq', 'USAGE') AS anon",
      );
      expect(sequences).toEqual([{ anon: false }]);
      const flagSequence: Array<{ anon: boolean }> = await dataSource.query(
        "SELECT has_sequence_privilege('anon', 'flag_seq', 'USAGE') AS anon",
      );
      expect(flagSequence).toEqual([{ anon: false }]);
    } finally {
      await dataSource.destroy();
    }
  });
});
