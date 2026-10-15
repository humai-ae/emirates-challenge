import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { MAX_UPLOAD_BYTES } from "@hrcc/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CSRF, createTestApp, signIn, type TestApp } from "./test-app.js";

const fixture = (name: string) =>
  readFileSync(new URL(`../../../tools/sample-data/fixtures/small/${name}`, import.meta.url));
const TRANSACTIONS = fixture("transactions.csv");
const EMPLOYEES = fixture("employees.csv");
const dataLines = (file: Buffer) => file.toString("utf8").trim().split("\n").slice(1);
const sha256 = (file: Buffer) => createHash("sha256").update(file).digest("hex");

type Agent = Awaited<ReturnType<typeof signIn>>;
type Attachment = [Buffer, string];

function upload(
  agent: Agent,
  files: { transactions?: Attachment; employees?: Attachment },
  fields: Record<string, string> = {},
) {
  let request = agent.post("/api/v1/datasets").set(CSRF);
  for (const [name, value] of Object.entries(fields)) request = request.field(name, value);
  if (files.transactions) request = request.attach("transactions", ...files.transactions);
  if (files.employees) request = request.attach("employees", ...files.employees);
  return request;
}

const pack = {
  transactions: [TRANSACTIONS, "transactions.csv"] as Attachment,
  employees: [EMPLOYEES, "employees.csv"] as Attachment,
};

/** A plain pack of the given size, made here so the test needs nothing else. */
function bigPack(employees: number, transactions: number) {
  const people = Array.from(
    { length: employees },
    (_, index) => `E-${String(index + 1).padStart(5, "0")}`,
  );
  const staff = people.map(
    (id, index) =>
      `${id},${5 + (index % 11)},Finance,Dubai,${index === 0 ? "" : people[0]},2015-01-01,`,
  );
  const rows = Array.from({ length: transactions }, (_, index) => {
    const month = String(1 + (index % 12)).padStart(2, "0");
    const day = String(1 + (index % 28)).padStart(2, "0");
    return [
      `TX-${String(index + 1).padStart(6, "0")}`,
      "overtime",
      people[index % employees],
      100 + (index % 900),
      "AED",
      `2025-${month}-${day}`,
      people[0],
      people[(index + 1) % employees],
      "",
    ].join(",");
  });
  return {
    employees: Buffer.from(
      `${["employee_id,grade,department,location,manager_id,hire_date,exit_date", ...staff].join("\n")}\n`,
    ),
    transactions: Buffer.from(
      `${["transaction_id,type,employee_id,amount,currency,effective_date,requester_id,approver_1_id,approver_2_id", ...rows].join("\n")}\n`,
    ),
  };
}

describe("dataset upload", () => {
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

  async function counts() {
    const [row]: Array<{ datasets: number; transactions: number; employees: number }> =
      await t.dataSource.query(`SELECT
        (SELECT count(*)::int FROM datasets) AS datasets,
        (SELECT count(*)::int FROM transactions) AS transactions,
        (SELECT count(*)::int FROM employees) AS employees`);
    return row;
  }

  it("stores both files in Storage and the rows, columns and issues in the database", async () => {
    const response = await upload(admin, pack, { name: "Training pack" }).expect(201);
    const { dataset } = response.body;
    expect(dataset).toMatchObject({
      name: "Training pack",
      status: "ready",
      rejection: null,
      transactionCount: dataLines(TRANSACTIONS).length,
      employeeCount: dataLines(EMPLOYEES).length,
      periodFrom: expect.stringMatching(/^2025-\d\d-\d\d$/),
      periodTo: expect.stringMatching(/^2025-\d\d-\d\d$/),
      columnsConfirmed: false,
      createdBy: "Layla Haddad",
      files: [
        {
          kind: "transactions",
          filename: "transactions.csv",
          sizeBytes: TRANSACTIONS.length,
          sha256: sha256(TRANSACTIONS),
        },
        {
          kind: "employees",
          filename: "employees.csv",
          sizeBytes: EMPLOYEES.length,
          sha256: sha256(EMPLOYEES),
        },
      ],
    });
    const codes = dataset.issues.map((issue: { code: string }) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining(["duplicate_id", "blank_values", "unknown_employee"]),
    );
    expect(dataset.issueCount).toBe(dataset.issues.length);
    const approver = dataset.columns.find(
      (column: { name: string }) => column.name === "approver_1_id",
    );
    expect(approver).toMatchObject({
      file: "transactions",
      role: "approver_ids",
      roleConfirmed: false,
    });

    expect(t.files.paths()).toEqual([
      `${dataset.id}/employees.csv`,
      `${dataset.id}/transactions.csv`,
    ]);
    expect(Buffer.from(await t.files.get(`${dataset.id}/transactions.csv`))).toEqual(TRANSACTIONS);

    const [first]: Array<Record<string, string>> = await t.dataSource.query(
      `SELECT transaction_id, type, employee_id, effective_date::text AS effective_date, data->>'approver_1_id' AS approver
       FROM transactions WHERE dataset_id = $1 AND row_no = 1`,
      [dataset.id],
    );
    const cells = (dataLines(TRANSACTIONS)[0] ?? "").split(",");
    expect(first).toEqual({
      transaction_id: cells[0],
      type: cells[1],
      employee_id: cells[2],
      effective_date: cells[7],
      approver: cells[9],
    });
    expect(await counts()).toMatchObject({
      transactions: dataset.transactionCount,
      employees: dataset.employeeCount,
    });
    const [event]: Array<{ actor_name: string; after: { name: string; status: string } }> =
      await t.dataSource.query(
        "SELECT actor_name, after FROM audit_events WHERE action = 'dataset.upload' AND object_id = $1",
        [dataset.id],
      );
    expect(event).toMatchObject({
      actor_name: "Layla Haddad",
      after: { name: "Training pack", status: "ready" },
    });
  });

  it("keeps an Arabic file name, and names an unnamed dataset after its files and the time", async () => {
    const response = await upload(admin, {
      ...pack,
      transactions: [TRANSACTIONS, "معاملات.csv"],
    }).expect(201);
    expect(response.body.dataset.files[0].filename).toBe("معاملات.csv");
    // Both files and the upload time (Dubai), so two uploads of the same files stay apart.
    expect(response.body.dataset.name).toMatch(
      /^معاملات\.csv \+ employees\.csv · \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
    );
  });

  it("reuses the employees file of an earlier dataset", async () => {
    const first = (await upload(admin, pack).expect(201)).body.dataset;
    const response = await upload(
      admin,
      { transactions: pack.transactions },
      { employeesFromDatasetId: first.id },
    ).expect(201);
    const { dataset } = response.body;
    expect(dataset.files[1]).toEqual({
      kind: "employees",
      filename: "employees.csv",
      sizeBytes: EMPLOYEES.length,
      sha256: sha256(EMPLOYEES),
    });
    expect(Buffer.from(await t.files.get(`${dataset.id}/employees.csv`))).toEqual(EMPLOYEES);
    await upload(admin, pack, { employeesFromDatasetId: first.id }).expect(400);
  });

  it("refuses a file that is not UTF-8 and creates nothing", async () => {
    const before = { counts: await counts(), paths: t.files.paths() };
    const latin1 = Buffer.from("transaction_id,note\nTX-1,Café\n", "latin1");
    const response = await upload(admin, {
      ...pack,
      transactions: [latin1, "transactions.csv"],
    }).expect(400);
    expect(response.body).toEqual({
      code: "file_unreadable",
      params: { file: "transactions", reason: "not_utf8" },
    });
    expect(await counts()).toEqual(before.counts);
    expect(t.files.paths()).toEqual(before.paths);
  });

  it("asks for both files, as .csv", async () => {
    const missing = await upload(admin, { transactions: pack.transactions }).expect(400);
    expect(missing.body).toEqual({ code: "file_missing", params: { file: "employees" } });
    const wrongType = await upload(admin, {
      ...pack,
      employees: [EMPLOYEES, "employees.xlsx"],
    }).expect(400);
    expect(wrongType.body).toEqual({
      code: "file_type_not_allowed",
      params: { file: "employees" },
    });
  });

  it("refuses a file over 25 MB", async () => {
    const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1, "a");
    const response = await upload(admin, { ...pack, transactions: [big, "big.csv"] }).expect(413);
    expect(response.body).toEqual({ code: "file_too_large", params: {} });
  });

  it("lets only admins upload, and only with the CSRF header", async () => {
    const analyst = await signIn(t, "omar.siddiqui@emirates.test");
    const forbidden = await upload(analyst, pack).expect(403);
    expect(forbidden.body.code).toBe("forbidden");
    const noHeader = await admin
      .post("/api/v1/datasets")
      .attach("transactions", ...pack.transactions)
      .attach("employees", ...pack.employees)
      .expect(403);
    expect(noHeader.body.code).toBe("csrf_missing");
  });

  it("stores a 10,000-row upload within seconds", async () => {
    const big = bigPack(2_000, 10_000);
    const started = Date.now();
    const response = await upload(admin, {
      transactions: [big.transactions, "transactions.csv"],
      employees: [big.employees, "employees.csv"],
    }).expect(201);
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(response.body.dataset).toMatchObject({
      status: "ready",
      transactionCount: 10_000,
      employeeCount: 2_000,
    });
    const [row]: Array<{ count: number }> = await t.dataSource.query(
      "SELECT count(*)::int AS count FROM transactions WHERE dataset_id = $1",
      [response.body.dataset.id],
    );
    expect(row?.count).toBe(10_000);
  });

  it("leaves nothing behind when storage fails", async () => {
    const before = { counts: await counts(), paths: t.files.paths() };
    // The transactions file is stored first; the employees file then fails.
    t.files.failWhen = (operation, path) => operation === "put" && path.endsWith("/employees.csv");
    const response = await upload(admin, pack).expect(503);
    expect(response.body).toEqual({ code: "storage_unavailable", params: {} });
    expect(t.files.paths()).toEqual(before.paths);
    expect(await counts()).toEqual(before.counts);
  });

  it("removes stored files when the database write fails", async () => {
    const before = { counts: await counts(), paths: t.files.paths() };
    await t.dataSource.query(`
      CREATE FUNCTION fail_dataset_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'database write failed (test)'; END $$`);
    await t.dataSource.query(
      "CREATE TRIGGER fail_dataset_insert BEFORE INSERT ON employees FOR EACH STATEMENT EXECUTE FUNCTION fail_dataset_insert()",
    );
    try {
      const response = await upload(admin, pack).expect(500);
      expect(response.body).toEqual({ code: "internal_error", params: {} });
    } finally {
      await t.dataSource.query("DROP TRIGGER fail_dataset_insert ON employees");
      await t.dataSource.query("DROP FUNCTION fail_dataset_insert()");
    }
    expect(t.files.paths()).toEqual(before.paths);
    expect(await counts()).toEqual(before.counts);
  });
});
