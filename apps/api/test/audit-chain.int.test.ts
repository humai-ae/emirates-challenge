import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SYSTEM_ACTOR } from "../src/audit/actor.js";
import { AuditService } from "../src/audit/audit.service.js";
import { UserEntity } from "../src/database/entities/index.js";
import { createTestApp, type TestApp } from "./test-app.js";

async function appendMany(t: TestApp, count: number): Promise<void> {
  const audit = t.app.get(AuditService);
  for (let index = 0; index < count; index += 1) {
    await t.dataSource.transaction((manager) =>
      audit.append(manager, {
        actor: SYSTEM_ACTOR,
        action: "auth.sign_in",
        objectType: "user",
        objectId: `u${index}`,
        after: { index },
      }),
    );
  }
}

describe("audit chain", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it("links each event to the previous one and verifies", async () => {
    await appendMany(t, 3);
    const audit = t.app.get(AuditService);
    const { events } = await audit.list({ limit: 50 });
    expect(events.map((event) => event.eventId)).toEqual([
      "EV-0000003",
      "EV-0000002",
      "EV-0000001",
    ]);
    expect(events[2]?.prevHash).toBe("0".repeat(64));
    expect(events[1]?.prevHash).toBe(events[2]?.hash);
    expect(events[0]?.prevHash).toBe(events[1]?.hash);
    await expect(audit.verifyChain()).resolves.toEqual({ ok: true, count: 3 });
  });

  it("verifies across batch boundaries", async () => {
    // A batch size of 2 forces three reads for three events.
    await expect(t.app.get(AuditService).verifyChain(2)).resolves.toEqual({ ok: true, count: 3 });
  });

  it("keeps one chain under concurrent appends", async () => {
    const audit = t.app.get(AuditService);
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        t.dataSource.transaction((manager) =>
          audit.append(manager, {
            actor: SYSTEM_ACTOR,
            action: "auth.sign_in",
            objectType: "user",
            objectId: `parallel-${index}`,
          }),
        ),
      ),
    );
    const rows: Array<{ prev_hash: string }> = await t.dataSource.query(
      "SELECT prev_hash FROM audit_events",
    );
    expect(new Set(rows.map((row) => row.prev_hash)).size).toBe(rows.length);
    await expect(audit.verifyChain()).resolves.toEqual({ ok: true, count: 23 });
  });

  it("pages newest first with a cursor and filters by object", async () => {
    const audit = t.app.get(AuditService);
    const first = await audit.list({ limit: 2 });
    expect(first.events).toHaveLength(2);
    expect(first.nextBefore).toBe(first.events[1]?.seq);
    const second = await audit.list({ limit: 2, before: first.nextBefore ?? undefined });
    expect(second.events[0]?.seq).toBeLessThan(first.events[1]?.seq ?? 0);
    const filtered = await audit.list({ limit: 50, objectId: "u1" });
    expect(filtered.events.map((event) => event.objectId)).toEqual(["u1"]);
  });

  it("saves nothing when the event cannot be written (action and event are atomic)", async () => {
    const audit = t.app.get(AuditService);
    await expect(
      t.dataSource.transaction(async (manager) => {
        await manager.update(
          UserEntity,
          { email: "omar.siddiqui@emirates.test" },
          { locale: "ar" },
        );
        await audit.append(manager, {
          actor: SYSTEM_ACTOR,
          action: "user.preferences_update",
          objectType: "user",
          objectId: null as unknown as string,
        });
      }),
    ).rejects.toThrow();
    const omar = await t.dataSource
      .getRepository(UserEntity)
      .findOneByOrFail({ email: "omar.siddiqui@emirates.test" });
    expect(omar.locale).toBe("en");
  });

  it("appends several events at once, each linked to the one before", async () => {
    const audit = t.app.get(AuditService);
    const before = await audit.list({ limit: 1 });
    await t.dataSource.transaction((manager) =>
      audit.appendMany(
        manager,
        ["a", "b", "c"].map((id) => ({
          actor: SYSTEM_ACTOR,
          action: "flag.create" as const,
          objectType: "flag",
          objectId: `F-${id}`,
          after: { name: id },
        })),
      ),
    );
    const { events } = await audit.list({ limit: 3 });
    expect(events.map((event) => event.objectId)).toEqual(["F-c", "F-b", "F-a"]);
    expect(events[2]?.prevHash).toBe(before.events[0]?.hash);
    expect(events[1]?.prevHash).toBe(events[2]?.hash);
    expect(events[0]?.prevHash).toBe(events[1]?.hash);
    await expect(audit.verifyChain()).resolves.toMatchObject({ ok: true });
    // Nothing to write is nothing written.
    await t.dataSource.transaction((manager) => audit.appendMany(manager, []));
    expect((await audit.list({ limit: 1 })).events[0]?.objectId).toBe("F-c");
  });
});

describe("tamper detection", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
    await appendMany(t, 5);
  });
  afterAll(async () => {
    await t.close();
  });

  it("names the first altered event", async () => {
    await t.dataSource.query(
      "ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_update_delete",
    );
    await t.dataSource.query(
      "UPDATE audit_events SET reason = 'edited' WHERE event_id = 'EV-0000003'",
    );
    await t.dataSource.query(
      "ALTER TABLE audit_events ENABLE TRIGGER audit_events_no_update_delete",
    );
    await expect(t.app.get(AuditService).verifyChain()).resolves.toEqual({
      ok: false,
      count: 2,
      brokenAt: "EV-0000003",
    });
  });

  it("detects a removed event at the event after it", async () => {
    await t.dataSource.query(
      "ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_update_delete",
    );
    await t.dataSource.query("UPDATE audit_events SET reason = NULL WHERE event_id = 'EV-0000003'");
    await t.dataSource.query("DELETE FROM audit_events WHERE event_id = 'EV-0000002'");
    await t.dataSource.query(
      "ALTER TABLE audit_events ENABLE TRIGGER audit_events_no_update_delete",
    );
    await expect(t.app.get(AuditService).verifyChain()).resolves.toEqual({
      ok: false,
      count: 1,
      brokenAt: "EV-0000003",
    });
  });
});
