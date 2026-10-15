import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ConfirmRolesRequest, DatasetColumn, DatasetDetail } from "@hrcc/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CSRF, createTestApp, signIn, type TestApp } from "./test-app.js";

const fixture = (name: string) =>
  readFileSync(new URL(`../../../tools/sample-data/fixtures/small/${name}`, import.meta.url));
const TRANSACTIONS = fixture("transactions.csv");
const EMPLOYEES = fixture("employees.csv");

type Agent = Awaited<ReturnType<typeof signIn>>;

async function uploadPack(agent: Agent, name = "Training pack"): Promise<DatasetDetail> {
  const response = await agent
    .post("/api/v1/datasets")
    .set(CSRF)
    .field("name", name)
    .attach("transactions", TRANSACTIONS, "transactions.csv")
    .attach("employees", EMPLOYEES, "employees.csv")
    .expect(201);
  return response.body.dataset;
}

/** The mapping a dataset's columns currently have, minus the roles to leave out. */
function mappingOf(columns: DatasetColumn[], leaveOut: string[] = []): ConfirmRolesRequest {
  const mapping: ConfirmRolesRequest = { transactions: {}, employees: {} };
  for (const column of columns) {
    if (!column.role || leaveOut.includes(column.role)) continue;
    const roles = mapping[column.file] as Record<string, string[]>;
    roles[column.role] = [...(roles[column.role] ?? []), column.name];
  }
  return mapping;
}

describe("datasets", () => {
  let t: TestApp;
  let admin: Agent;
  beforeAll(async () => {
    t = await createTestApp();
    admin = await signIn(t, "layla.haddad@emirates.test");
  });
  afterEach(() => {
    t.files.failWhen = () => false;
  });
  afterAll(async () => {
    await t.close();
  });

  it("lists datasets newest first, for admins and analysts only", async () => {
    const older = await uploadPack(admin, "Older pack");
    const newer = await uploadPack(admin, "Newer pack");
    const analyst = await signIn(t, "omar.siddiqui@emirates.test");
    const response = await analyst.get("/api/v1/datasets").expect(200);
    const ids = response.body.datasets.map((dataset: { id: string }) => dataset.id);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
    expect(response.body.datasets[0]).toEqual({
      id: newer.id,
      name: "Newer pack",
      status: "ready",
      rejection: null,
      transactionCount: newer.transactionCount,
      employeeCount: newer.employeeCount,
      periodFrom: newer.periodFrom,
      periodTo: newer.periodTo,
      issueCount: newer.issueCount,
      columnsConfirmed: false,
      createdAt: newer.createdAt,
      createdBy: "Layla Haddad",
    });
    for (const email of ["priya.nair@emirates.test", "daniel.mensah@emirates.test"]) {
      const other = await signIn(t, email);
      await other.get("/api/v1/datasets").expect(403);
    }
  });

  it("shows a dataset in detail, and answers 404 or 400 for bad ids", async () => {
    const uploaded = await uploadPack(admin);
    const response = await admin.get(`/api/v1/datasets/${uploaded.id}`).expect(200);
    expect(response.body.dataset).toEqual(uploaded);
    const missing = await admin.get(`/api/v1/datasets/${randomUUID()}`).expect(404);
    expect(missing.body.code).toBe("not_found");
    await admin.get("/api/v1/datasets/not-a-uuid").expect(400);
  });

  it("confirms column roles by re-reading the stored files", async () => {
    const uploaded = await uploadPack(admin);
    const issueRoles = (dataset: DatasetDetail) => dataset.issues.map((issue) => issue.role);
    expect(issueRoles(uploaded)).toContain("approver_ids");

    // Leaving approvers unassigned: their columns lose the role and their issues go.
    const withoutApprovers = await admin
      .patch(`/api/v1/datasets/${uploaded.id}/columns`)
      .set(CSRF)
      .send(mappingOf(uploaded.columns, ["approver_ids"]))
      .expect(200);
    const confirmed: DatasetDetail = withoutApprovers.body.dataset;
    expect(confirmed.columnsConfirmed).toBe(true);
    expect(confirmed.columns.every((column) => column.roleConfirmed)).toBe(true);
    expect(confirmed.columns.find((column) => column.name === "approver_1_id")?.role).toBeNull();
    expect(issueRoles(confirmed)).not.toContain("approver_ids");

    // Without a transaction ID the dataset is rejected; giving it back makes it ready again.
    const rejected = await admin
      .patch(`/api/v1/datasets/${uploaded.id}/columns`)
      .set(CSRF)
      .send(mappingOf(uploaded.columns, ["transaction_id"]))
      .expect(200);
    expect(rejected.body.dataset).toMatchObject({
      status: "rejected",
      rejection: "no_transaction_id",
    });
    const restored = await admin
      .patch(`/api/v1/datasets/${uploaded.id}/columns`)
      .set(CSRF)
      .send(mappingOf(uploaded.columns))
      .expect(200);
    expect(restored.body.dataset).toMatchObject({ status: "ready", rejection: null });
    expect(issueRoles(restored.body.dataset)).toContain("approver_ids");

    const [rows]: Array<{ count: number; with_id: number }> = await t.dataSource.query(
      "SELECT count(*)::int AS count, count(transaction_id)::int AS with_id FROM transactions WHERE dataset_id = $1",
      [uploaded.id],
    );
    expect(rows).toEqual({ count: uploaded.transactionCount, with_id: uploaded.transactionCount });
    const events: Array<{ before: unknown; after: { status: string } }> = await t.dataSource.query(
      "SELECT before, after FROM audit_events WHERE action = 'dataset.columns_confirm' AND object_id = $1 ORDER BY seq",
      [uploaded.id],
    );
    expect(events.map((event) => event.after.status)).toEqual(["ready", "rejected", "ready"]);
    expect(events[0]?.before).toEqual({ roles: mappingOf(uploaded.columns) });
  });

  it("refuses unknown columns, double roles and non-admins", async () => {
    const uploaded = await uploadPack(admin);
    const unknown = await admin
      .patch(`/api/v1/datasets/${uploaded.id}/columns`)
      .set(CSRF)
      .send({ transactions: { transaction_id: ["no_such_column"] }, employees: {} })
      .expect(400);
    expect(unknown.body).toEqual({
      code: "unknown_column",
      params: { file: "transactions", column: "no_such_column" },
    });
    const twoColumns = await admin
      .patch(`/api/v1/datasets/${uploaded.id}/columns`)
      .set(CSRF)
      .send({ transactions: { transaction_id: ["transaction_id", "type"] }, employees: {} })
      .expect(400);
    expect(twoColumns.body.code).toBe("validation_failed");
    const analyst = await signIn(t, "omar.siddiqui@emirates.test");
    await analyst
      .patch(`/api/v1/datasets/${uploaded.id}/columns`)
      .set(CSRF)
      .send(mappingOf(uploaded.columns))
      .expect(403);
    await analyst.delete(`/api/v1/datasets/${uploaded.id}`).set(CSRF).expect(403);
  });

  it("deletes a dataset's contents but keeps its record", async () => {
    const uploaded = await uploadPack(admin);
    const response = await admin.delete(`/api/v1/datasets/${uploaded.id}`).set(CSRF).expect(200);
    const deleted: DatasetDetail = response.body.dataset;
    expect(deleted).toMatchObject({ id: uploaded.id, name: "Training pack", status: "deleted" });
    expect(deleted.files.map((file) => file.sha256)).toEqual(
      uploaded.files.map((file) => file.sha256),
    );
    expect(deleted.columns.map((column) => column.name)).toEqual(
      uploaded.columns.map((column) => column.name),
    );
    expect(
      deleted.columns.every((column) => column.samples.length === 0 && column.min === null),
    ).toBe(true);
    expect(deleted.issues.every((issue) => issue.examples.length === 0)).toBe(true);
    expect(t.files.paths().filter((path) => path.startsWith(uploaded.id))).toEqual([]);

    const [left]: Array<{ transactions: number; employees: number; paths: number }> =
      await t.dataSource.query(
        `SELECT (SELECT count(*)::int FROM transactions WHERE dataset_id = $1) AS transactions,
                (SELECT count(*)::int FROM employees WHERE dataset_id = $1) AS employees,
                (SELECT count(storage_path)::int FROM dataset_files WHERE dataset_id = $1) AS paths`,
        [uploaded.id],
      );
    expect(left).toEqual({ transactions: 0, employees: 0, paths: 0 });

    const confirm = await admin
      .patch(`/api/v1/datasets/${uploaded.id}/columns`)
      .set(CSRF)
      .send(mappingOf(uploaded.columns))
      .expect(409);
    expect(confirm.body.code).toBe("dataset_deleted");
    await admin.delete(`/api/v1/datasets/${uploaded.id}`).set(CSRF).expect(200);
    const actions: Array<{ action: string }> = await t.dataSource.query(
      "SELECT action FROM audit_events WHERE object_id = $1 ORDER BY seq",
      [uploaded.id],
    );
    expect(actions.map((row) => row.action)).toEqual(["dataset.upload", "dataset.delete"]);
  });

  it("keeps a dataset intact when storage can't delete its files", async () => {
    const uploaded = await uploadPack(admin);
    t.files.failWhen = (operation) => operation === "remove";
    const response = await admin.delete(`/api/v1/datasets/${uploaded.id}`).set(CSRF).expect(503);
    expect(response.body).toEqual({ code: "storage_unavailable", params: {} });
    t.files.failWhen = () => false;
    const current = await admin.get(`/api/v1/datasets/${uploaded.id}`).expect(200);
    expect(current.body.dataset.status).toBe("ready");
    expect(t.files.paths()).toEqual(
      expect.arrayContaining([`${uploaded.id}/employees.csv`, `${uploaded.id}/transactions.csv`]),
    );
  });
});
