import { randomUUID } from "node:crypto";
import type { DataIssue } from "@hrcc/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatasetEntity, UserEntity } from "../src/database/entities/index.js";
import { createTestApp, type TestApp } from "./test-app.js";

describe("dataset tables", () => {
  let t: TestApp;
  let adminId: string;
  beforeAll(async () => {
    t = await createTestApp();
    const admin = await t.dataSource
      .getRepository(UserEntity)
      .findOneByOrFail({ email: "layla.haddad@emirates.test" });
    adminId = admin.id;
  });
  afterAll(async () => {
    await t.close();
  });

  function dataset(overrides: Partial<DatasetEntity> = {}) {
    return {
      id: randomUUID(),
      name: "Training pack",
      status: "ready" as DatasetEntity["status"],
      rejection: null,
      transactionCount: 300,
      employeeCount: 60,
      periodFrom: "2025-01-02",
      periodTo: "2025-12-30",
      issues: [] as DataIssue[],
      columnsConfirmed: false,
      createdById: adminId,
      deletedAt: null,
      ...overrides,
    };
  }

  it("creates the dataset tables", async () => {
    const rows: Array<{ table_name: string }> = await t.dataSource.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    expect(rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining([
        "datasets",
        "dataset_files",
        "dataset_columns",
        "transactions",
        "employees",
      ]),
    );
  });

  it("reads a dataset back with its period as calendar dates and its uploader", async () => {
    const repository = t.dataSource.getRepository(DatasetEntity);
    const issues: DataIssue[] = [
      {
        code: "blank_values",
        file: "transactions",
        column: "approver_1_id",
        role: "approver_ids",
        count: 2,
        examples: ["TX-000001", "TX-000002"],
      },
    ];
    const saved = dataset({ issues });
    await repository.insert(saved);
    const loaded = await repository.findOneOrFail({
      where: { id: saved.id },
      relations: { createdBy: true },
    });
    expect(loaded).toMatchObject({
      periodFrom: "2025-01-02",
      periodTo: "2025-12-30",
      issues,
      columnsConfirmed: false,
    });
    expect(loaded.createdBy.displayName).toBe("Layla Haddad");
  });

  it("keeps status, rejection and deletion time consistent", async () => {
    const repository = t.dataSource.getRepository(DatasetEntity);
    await expect(repository.insert(dataset({ rejection: "no_employee_id" }))).rejects.toThrow(
      /datasets_rejection_status/,
    );
    await expect(repository.insert(dataset({ status: "rejected" }))).rejects.toThrow(
      /datasets_rejection_status/,
    );
    await expect(repository.insert(dataset({ status: "deleted" }))).rejects.toThrow(
      /datasets_deleted_at/,
    );
    await expect(
      repository.insert(dataset({ status: "rejected", rejection: "no_transaction_id" })),
    ).resolves.toBeDefined();
  });
});
