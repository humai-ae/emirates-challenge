import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./test-app.js";

describe("flags schema", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it("creates the flags and notices tables with their sequence", async () => {
    const tables: Array<{ table_name: string }> = await t.dataSource.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('flags', 'notices') ORDER BY table_name",
    );
    expect(tables.map((row) => row.table_name)).toEqual(["flags", "notices"]);
    const [{ n }]: Array<{ n: string }> = await t.dataSource.query(
      "SELECT nextval('flag_seq') AS n",
    );
    expect(Number(n)).toBe(1);
  });

  it("ranks severity in the database, High first", async () => {
    const columns: Array<{ column_name: string; is_generated: string }> = await t.dataSource.query(
      "SELECT column_name, is_generated FROM information_schema.columns WHERE table_name = 'flags' AND column_name = 'severity_rank'",
    );
    expect(columns).toEqual([{ column_name: "severity_rank", is_generated: "ALWAYS" }]);
  });

  it("keeps a decided flag's decision and a fixed flag's fix", async () => {
    const checks: Array<{ conname: string }> = await t.dataSource.query(
      "SELECT conname FROM pg_constraint WHERE conrelid = 'flags'::regclass AND contype = 'c' ORDER BY conname",
    );
    expect(checks.map((row) => row.conname)).toEqual(
      expect.arrayContaining([
        "flags_assigned",
        "flags_closed",
        "flags_decided",
        "flags_fixed",
        "flags_owner",
      ]),
    );
  });
});
