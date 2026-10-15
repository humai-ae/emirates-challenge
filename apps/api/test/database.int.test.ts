import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDemo } from "../src/database/demo-seed.js";
import { UserEntity } from "../src/database/entities/index.js";
import { createTestApp, type TestApp } from "./test-app.js";

describe("database", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it("creates the foundation tables", async () => {
    const rows: Array<{ table_name: string }> = await t.dataSource.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    expect(rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining(["teams", "users", "sessions", "audit_events"]),
    );
  });

  it("seeds the demo teams and users, and seeding twice changes nothing", async () => {
    await seedDemo(t.dataSource);
    const users = await t.dataSource.getRepository(UserEntity).find({ relations: { team: true } });
    expect(users.map((user) => user.username).sort()).toEqual([
      "ahmed.rahman",
      "daniel.mensah",
      "layla.haddad",
      "omar.siddiqui",
      "priya.nair",
    ]);
    const priya = users.find((user) => user.username === "priya.nair");
    expect(priya?.team?.nameEn).toBe("Payroll & Compensation");
    expect(priya?.team?.nameAr).toBe("الرواتب والتعويضات");
  });

  it("rejects a team lead without a team", async () => {
    await expect(
      t.dataSource.query(
        "INSERT INTO users (username, display_name, role) VALUES ('x.y', 'X Y', 'lead')",
      ),
    ).rejects.toThrow(/lead_has_team/);
  });

  it("enables row-level security on every table, so Supabase's Data API cannot read them", async () => {
    const rows: Array<{ relname: string; relrowsecurity: boolean }> = await t.dataSource.query(
      "SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY($1) ORDER BY relname",
      [["audit_events", "sessions", "teams", "users"]],
    );
    expect(rows).toEqual([
      { relname: "audit_events", relrowsecurity: true },
      { relname: "sessions", relrowsecurity: true },
      { relname: "teams", relrowsecurity: true },
      { relname: "users", relrowsecurity: true },
    ]);
  });

  it("makes audit_events append-only", async () => {
    await t.dataSource.query(
      `INSERT INTO audit_events (seq, event_id, at, actor_id, actor_name, role, action, object_type, object_id, prev_hash, hash)
       VALUES (nextval('audit_events_seq'), 'EV-TEST', now(), 'system', 'System', 'system', 'auth.sign_in', 'user', 'u1', 'p', 'h')`,
    );
    await expect(t.dataSource.query("UPDATE audit_events SET reason = 'x'")).rejects.toThrow(
      /append-only/,
    );
    await expect(t.dataSource.query("DELETE FROM audit_events")).rejects.toThrow(/append-only/);
    await expect(t.dataSource.query("TRUNCATE audit_events")).rejects.toThrow(/append-only/);
  });
});
