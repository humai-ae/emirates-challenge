import pg from "pg";
import { DataSource } from "typeorm";
import { describe, expect, it } from "vitest";
import { dataSourceOptions } from "../src/database/options.js";
import { createTestDatabase } from "./test-app.js";

describe("Supabase Data API exposure", () => {
  it("leaves Supabase's anon and authenticated roles without access to any table", async () => {
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
    await client.end();

    const dataSource = new DataSource(
      dataSourceOptions({ DATABASE_URL: url, DATABASE_SSL: "disable", DATABASE_SSL_CA: undefined }),
    );
    await dataSource.initialize();
    try {
      await dataSource.runMigrations();
      const rows: Array<{ name: string; anon: boolean; authenticated: boolean }> =
        await dataSource.query(
          `SELECT name,
                has_table_privilege('anon', name, 'SELECT') AS anon,
                has_table_privilege('authenticated', name, 'SELECT') AS authenticated
         FROM unnest(ARRAY['audit_events', 'sessions', 'teams', 'users']) AS name`,
        );
      expect(rows).toEqual([
        { name: "audit_events", anon: false, authenticated: false },
        { name: "sessions", anon: false, authenticated: false },
        { name: "teams", anon: false, authenticated: false },
        { name: "users", anon: false, authenticated: false },
      ]);
    } finally {
      await dataSource.destroy();
    }
  });
});
