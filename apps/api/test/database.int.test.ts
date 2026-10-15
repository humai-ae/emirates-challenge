import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyPassword } from "../src/auth/password.js";
import { seedDemo } from "../src/database/demo-seed.js";
import { UserEntity } from "../src/database/entities/index.js";
import { createTestApp, TEST_PASSWORD, type TestApp } from "./test-app.js";

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

  it("seeds the demo teams and accounts with the seed password", async () => {
    const users = await t.dataSource.getRepository(UserEntity).find({ relations: { team: true } });
    expect(users.map((user) => user.email).sort()).toEqual([
      "ahmed.rahman@emirates.test",
      "daniel.mensah@emirates.test",
      "layla.haddad@emirates.test",
      "omar.siddiqui@emirates.test",
      "priya.nair@emirates.test",
    ]);
    const priya = users.find((user) => user.email === "priya.nair@emirates.test");
    expect(priya?.team?.nameEn).toBe("Payroll & Compensation");
    expect(priya?.team?.nameAr).toBe("الرواتب والتعويضات");
    expect(users.every((user) => user.isDemo && user.isActive && !user.mustChangePassword)).toBe(
      true,
    );
    expect(await verifyPassword(TEST_PASSWORD, priya?.passwordHash ?? "")).toBe(true);
  });

  it("never overwrites a password when seeding again, but fills one that is missing", async () => {
    const users = t.dataSource.getRepository(UserEntity);
    const before = await users.findOneByOrFail({ email: "omar.siddiqui@emirates.test" });
    await users.update({ email: "daniel.mensah@emirates.test" }, { passwordHash: null });
    await seedDemo(t.dataSource, { password: "another-password-9" });
    const omar = await users.findOneByOrFail({ email: "omar.siddiqui@emirates.test" });
    const daniel = await users.findOneByOrFail({ email: "daniel.mensah@emirates.test" });
    expect(omar.passwordHash).toBe(before.passwordHash);
    expect(await verifyPassword("another-password-9", daniel.passwordHash ?? "")).toBe(true);
    expect(await users.count()).toBe(5);
  });

  it("rejects a team lead without a team and an email with capitals", async () => {
    await expect(
      t.dataSource.query(
        "INSERT INTO users (email, display_name, role) VALUES ('x.y@emirates.test', 'X Y', 'lead')",
      ),
    ).rejects.toThrow(/lead_has_team/);
    await expect(
      t.dataSource.query(
        "INSERT INTO users (email, display_name, role) VALUES ('X.Y@emirates.test', 'X Y', 'analyst')",
      ),
    ).rejects.toThrow(/users_email_lower_case/);
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
