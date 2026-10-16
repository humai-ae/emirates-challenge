import type { RunResponse } from "@hrcc/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type FlagsFixture, runWithFlags } from "./flags-setup.js";
import { CSRF, createTestApp, type TestApp } from "./test-app.js";

interface StoredFlag {
  id: string;
  rule_id: string;
  transaction_ids: string[];
  status: string;
  severity: string;
  severity_reasons: unknown;
  owner_team_id: string | null;
  due_date: string;
  report_to: unknown;
  seen_again: unknown[];
}

/** Today in Dubai, plus some days, as YYYY-MM-DD. */
function dubaiDayPlus(days: number): string {
  const today = new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10);
  return new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

describe("flags from a run", () => {
  let t: TestApp;
  let fx: FlagsFixture;
  beforeAll(async () => {
    t = await createTestApp();
    fx = await runWithFlags(t);
  }, 60_000);
  afterAll(async () => {
    await t.close();
  });

  const flags = (): Promise<StoredFlag[]> =>
    t.dataSource.query(
      `SELECT id, rule_id, transaction_ids, status, severity, severity_reasons, owner_team_id,
         due_date::text AS due_date, report_to, seen_again
       FROM flags ORDER BY id`,
    );

  it("raises a flag for each finding, waiting for an analyst", async () => {
    const stored = await flags();
    expect(
      stored.map((flag) => [flag.id, flag.rule_id, flag.transaction_ids[0], flag.status]),
    ).toEqual([
      ["F-000001", "R-01", "TX-000006", "with_analyst"],
      ["F-000002", "R-02", "TX-000088", "with_analyst"],
      ["F-000003", "R-02", "TX-000119", "with_analyst"],
      ["F-000004", "R-02", "TX-000174", "with_analyst"],
      ["F-000005", "R-02", "TX-000209", "with_analyst"],
      ["F-000006", "R-02", "TX-000213", "with_analyst"],
      ["F-000007", "R-02", "TX-000223", "with_analyst"],
      ["F-000008", "R-02", "TX-000246", "with_analyst"],
      ["F-000009", "R-03", "TX-000171", "with_analyst"],
      ["F-000010", "R-04", "TX-000115", "with_analyst"],
      ["F-000011", "R-04", "TX-000184", "with_analyst"],
      ["F-000012", "R-04", "TX-000196", "with_analyst"],
      ["F-000013", "R-04", "TX-000278", "with_analyst"],
    ]);
    const { run } = (await fx.admin.get(`/api/v1/runs/${fx.runId}`).expect(200))
      .body as RunResponse;
    expect(run.totals).toMatchObject({ findings: 13, newFlags: 13, seenAgain: 0 });
  });

  it("sets each flag's severity with its reasons, owner team and due date", async () => {
    const byId = new Map((await flags()).map((flag) => [flag.id, flag]));
    expect(byId.get("F-000001")).toMatchObject({
      severity: "High",
      severity_reasons: [{ code: "rule_default", severity: "High" }],
      owner_team_id: fx.teams.payroll,
      due_date: dubaiDayPlus(3),
    });
    expect(byId.get("F-000002")).toMatchObject({ owner_team_id: fx.teams.onboarding });
    expect(byId.get("F-000009")).toMatchObject({
      severity: "Medium",
      owner_team_id: null,
      due_date: dubaiDayPlus(7),
    });
    // TX-000115 and TX-000278 are both E-0043's, so each raises the other from Medium.
    expect(byId.get("F-000010")).toMatchObject({
      severity: "High",
      severity_reasons: [
        { code: "rule_default", severity: "Medium" },
        { code: "repeat_open_flag", flagId: "F-000013", person: "employee", personId: "E-0043" },
      ],
      due_date: dubaiDayPlus(3),
    });
    // TX-000184 and TX-000196 share only their requester, E-0008.
    expect(byId.get("F-000011")).toMatchObject({
      severity_reasons: [
        { code: "rule_default", severity: "Medium" },
        { code: "repeat_open_flag", flagId: "F-000012", person: "requester", personId: "E-0008" },
      ],
    });
  });

  it("works out who should hear about each flag", async () => {
    const byId = new Map((await flags()).map((flag) => [flag.id, flag]));
    // The pack's grade quartiles are 3, 6 and 10.
    expect(byId.get("F-000001")?.report_to).toEqual({
      level: "hr_manager",
      severity: "High",
      band: "mid",
      basis: { role: "approver", id: "E-0024", grade: 6 },
      personId: null,
    });
    expect(byId.get("F-000009")?.report_to).toEqual({
      level: "hr_director",
      severity: "Medium",
      band: "executive",
      basis: { role: "approver", id: "E-0006", grade: 14 },
      personId: null,
    });
    expect(byId.get("F-000002")?.report_to).toMatchObject({
      level: "chro",
      basis: { role: "requester", id: "E-0005", grade: 14 },
    });
  });

  it("keeps what the flag shows, and writes its creation to the audit log", async () => {
    const [flag]: Array<{
      transaction: Array<{ column: string; value: string }>;
      people: unknown;
      explanation_en: string;
      rule_title: string;
    }> = await t.dataSource.query(
      "SELECT transaction, people, explanation_en, rule_title FROM flags WHERE id = 'F-000001'",
    );
    expect(flag?.transaction.slice(0, 3)).toEqual([
      { column: "transaction_id", value: "TX-000006" },
      { column: "type", value: "allowance_change" },
      { column: "employee_id", value: "E-0049" },
    ]);
    expect(flag?.people).toEqual([
      { role: "employee", id: "E-0049", found: true, grade: "3", department: "Human Resources" },
      { role: "requester", id: "E-0038", found: true, grade: "4", department: "Human Resources" },
      { role: "approver", id: "E-0024", found: true, grade: "6", department: "Human Resources" },
    ]);
    expect(flag?.explanation_en).toContain("no approver is grade 10 or above");
    expect(flag?.rule_title).toContain("allowance");
    const events: Array<{ actor_name: string; object_id: string; after: unknown }> =
      await t.dataSource.query(
        "SELECT actor_name, object_id, after FROM audit_events WHERE action = 'flag.create' ORDER BY seq",
      );
    expect(events).toHaveLength(13);
    expect(events[0]).toEqual({
      actor_name: "System",
      object_id: "F-000001",
      after: expect.objectContaining({
        name: "F-000001",
        run: fx.runId,
        severity: "High",
        owner: "Payroll & Compensation",
        reportTo: "hr_manager",
      }),
    });
  });

  it("links a repeat of an open flag instead of raising it again", async () => {
    const { run } = (await fx.admin.post("/api/v1/runs").set(CSRF).send({}).expect(201))
      .body as RunResponse;
    expect(run.totals).toMatchObject({ findings: 13, newFlags: 0, seenAgain: 13 });
    const stored = await flags();
    expect(stored).toHaveLength(13);
    expect(stored.every((flag) => flag.seen_again.length === 1)).toBe(true);
    expect(stored[0]?.seen_again[0]).toMatchObject({ runId: run.id });
    const [{ count }]: Array<{ count: number }> = await t.dataSource.query(
      "SELECT count(*)::int AS count FROM audit_events WHERE action = 'flag.seen_again'",
    );
    expect(count).toBe(13);
  });

  it("raises a new flag when the earlier one is dismissed or the row changed", async () => {
    await t.dataSource.query(
      `UPDATE flags SET status = 'dismissed', decision = '{"action":"dismiss"}' WHERE id = 'F-000009'`,
    );
    // As if the transaction had been edited since F-000001 was raised.
    await t.dataSource.query(
      `UPDATE flags SET transaction = '[{"column":"transaction_id","value":"TX-000006"}]' WHERE id = 'F-000001'`,
    );
    const { run } = (await fx.admin.post("/api/v1/runs").set(CSRF).send({}).expect(201))
      .body as RunResponse;
    expect(run.totals).toMatchObject({ newFlags: 2, seenAgain: 11 });
    const raised = (await flags())
      .filter((flag) => flag.id > "F-000013")
      .map((flag) => [flag.id, flag.rule_id, flag.transaction_ids[0]]);
    expect(raised).toEqual([
      ["F-000014", "R-01", "TX-000006"],
      ["F-000015", "R-03", "TX-000171"],
    ]);
  });
});
