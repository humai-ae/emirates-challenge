import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DatasetEntity,
  FindingFormatEntity,
  RunEntity,
  RunResultEntity,
  UserEntity,
} from "../src/database/entities/index.js";
import { createTestApp, type TestApp } from "./test-app.js";

const counts = {
  not_applicable: 212,
  passed: 81,
  flagged: 7,
  could_not_check: 0,
  needs_judgment: 0,
};

describe("run tables", () => {
  let t: TestApp;
  let adminId: string;
  let datasetId: string;
  beforeAll(async () => {
    t = await createTestApp();
    const admin = await t.dataSource
      .getRepository(UserEntity)
      .findOneByOrFail({ email: "layla.haddad@emirates.test" });
    adminId = admin.id;
    datasetId = randomUUID();
    await t.dataSource.getRepository(DatasetEntity).insert({
      id: datasetId,
      name: "Training pack",
      status: "ready",
      rejection: null,
      transactionCount: 300,
      employeeCount: 60,
      periodFrom: "2025-01-02",
      periodTo: "2025-12-30",
      issues: [],
      columnsConfirmed: true,
      createdById: adminId,
      deletedAt: null,
    });
  });
  afterAll(async () => {
    await t.close();
  });

  async function run(id: string) {
    const now = new Date();
    await t.dataSource.getRepository(RunEntity).insert({
      id,
      datasetId,
      status: "complete",
      rules: [
        {
          ruleId: "R-01",
          version: 1,
          title: "Approval of large allowance changes",
          preset: "approver_min_grade",
          values: { types: ["allowance_change"], amount_limit: 10000, min_approver_grade: 10 },
          severity: "High",
          ownerTeam: null,
          suggestedActionEn: "Get approval.",
          suggestedActionAr: "احصل على الاعتماد.",
          counts,
          error: null,
        },
      ],
      totals: {
        transactions: 300,
        findings: 7,
        couldNotCheck: 0,
        waitingForAi: 0,
        durationMs: 412,
      },
      startedById: adminId,
      startedAt: now,
      finishedAt: now,
    });
  }

  function result(runId: string, overrides: Partial<RunResultEntity> = {}) {
    return {
      runId,
      seq: 1,
      ruleId: "R-01",
      ruleVersion: 1,
      rowNo: 4,
      transactionId: "TX-000004",
      employeeId: "E-0004",
      transactionType: "allowance_change",
      department: "Finance",
      effectiveDate: "2025-02-20",
      amount: "16200",
      outcome: "flagged" as RunResultEntity["outcome"],
      findingNo: 1,
      evidence: [{ field: "amount", value: "16200", condition: "> 10000" }],
      missing: [],
      error: null,
      ...overrides,
    };
  }

  it("creates the run tables", async () => {
    const rows: Array<{ table_name: string }> = await t.dataSource.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    expect(rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining(["runs", "run_results", "finding_formats"]),
    );
  });

  it("reads a run back with its rule snapshot and results", async () => {
    await run("RUN-2026-10-16-01");
    const results = t.dataSource.getRepository(RunResultEntity);
    await results.insert(result("RUN-2026-10-16-01"));
    const loaded = await t.dataSource.getRepository(RunEntity).findOneOrFail({
      where: { id: "RUN-2026-10-16-01" },
      relations: { dataset: true, startedBy: true },
    });
    expect(loaded.rules[0]).toMatchObject({ ruleId: "R-01", counts });
    expect(loaded.dataset.name).toBe("Training pack");
    expect(loaded.startedBy.displayName).toBe("Layla Haddad");
    expect(await results.findOneByOrFail({ runId: "RUN-2026-10-16-01", seq: 1 })).toMatchObject({
      effectiveDate: "2025-02-20",
      evidence: [{ field: "amount", value: "16200", condition: "> 10000" }],
    });
    await expect(
      results.insert(result("RUN-2026-10-16-01", { seq: 2, outcome: "could_not_check" })),
    ).rejects.toThrow(/run_results_finding_no/);
    await expect(
      results.insert(result("RUN-2026-10-16-01", { seq: 3, findingNo: null })),
    ).rejects.toThrow(/run_results_finding_no/);
  });

  it("keeps a format's confirmation consistent", async () => {
    const formats = t.dataSource.getRepository(FindingFormatEntity);
    const format = {
      filename: "finding_format.csv",
      sizeBytes: 1024,
      sha256: "a".repeat(64),
      columns: ["transaction_id", "rule_id"],
      examples: [["TX-000004", "R-01"]],
      mapping: ["transaction_id" as const, "rule_id" as const],
      values: {
        severity: "title" as const,
        findingIdPrefix: "F-",
        findingIdWidth: 4,
        dateFormat: null,
        status: "OPEN",
      },
      rowVersion: 1,
      uploadedById: adminId,
    };
    await expect(
      formats.insert({ ...format, id: randomUUID(), confirmedById: adminId, confirmedAt: null }),
    ).rejects.toThrow(/finding_formats_confirmed/);
    const id = randomUUID();
    await formats.insert({ ...format, id, confirmedById: null, confirmedAt: null });
    expect(await formats.findOneByOrFail({ id })).toMatchObject({
      mapping: ["transaction_id", "rule_id"],
    });
  });
});
