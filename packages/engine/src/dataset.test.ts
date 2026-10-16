import { describe, expect, it } from "vitest";
import { analyzeDataset } from "./analyze.js";
import { APPROVAL_TIMES, datasetInputFromAnalysis } from "./dataset.js";
import {
  APPROVER_TIME_COLUMNS,
  dataset,
  TRANSACTION_COLUMNS,
  table,
  tx,
} from "./testing/dataset.js";
import { dayNumber } from "./values.js";

describe("datasetInputFromAnalysis", () => {
  it("keeps every column with its role and format, and every row", () => {
    const input = {
      transactions:
        table(`transaction_id,type,employee_id,amount,effective_date,requester_id,approver_1_id,approver_2_id,approved_at
TX-1,allowance_change,E-0004,12000,2025-03-01,E-0003,E-0002,E-0001,2025-02-25 11:00
TX-2,pay_change,E-0003,4000,2025-04-01,E-0002,E-0001,,2025-03-20 15:30
`),
      employees: table(`employee_id,grade,manager_id
E-0001,15,
E-0002,12,E-0001
E-0003,9,E-0002
E-0004,7,E-0003
`),
    };
    const result = datasetInputFromAnalysis(analyzeDataset(input), input);
    expect(
      result.columns
        .filter((column) => column.role === "approver_ids")
        .map((column) => column.name),
    ).toEqual(["approver_1_id", "approver_2_id"]);
    expect(result.columns.find((column) => column.name === "approved_at")).toMatchObject({
      file: "transactions",
      type: "datetime",
      dateFormat: "YYYY-MM-DD HH:mm",
      role: "approved_at",
    });
    expect(result.transactions[1]).toMatchObject({ transaction_id: "TX-2", approver_2_id: "" });
    expect(result.employees).toHaveLength(4);
  });
});

describe("PreparedDataset", () => {
  it("resolves transaction columns and joined employee fields", () => {
    const data = dataset([tx({ amount: "16200" })]);
    expect(data.rows[0]).toMatchObject({ index: 0, rowNo: 1, transactionId: "TX-1" });
    expect(data.field(0, "amount")).toEqual({ kind: "value", value: 16200, raw: "16200" });
    expect(data.field(0, "employee.grade")).toEqual({ kind: "value", value: 7, raw: "7" });
    expect(data.field(0, "requester.grade")).toEqual({ kind: "value", value: 9, raw: "9" });
  });

  it("names what is missing: blank, unreadable or not in the employees file", () => {
    const data = dataset([
      tx({ amount: "", employee_id: "E-0099" }),
      tx({ amount: "AED 5k", employee_id: "" }),
      tx({ employee_id: "E-0008" }),
    ]);
    expect(data.field(0, "amount")).toEqual({
      kind: "missing",
      missing: [{ field: "amount", reason: "blank" }],
    });
    expect(data.field(1, "amount")).toEqual({
      kind: "missing",
      missing: [{ field: "amount", reason: "invalid" }],
    });
    expect(data.field(0, "employee.grade")).toEqual({
      kind: "missing",
      missing: [{ field: "employee_id", reason: "not_found", value: "E-0099" }],
    });
    expect(data.field(1, "employee.grade")).toEqual({
      kind: "missing",
      missing: [{ field: "employee_id", reason: "blank" }],
    });
    expect(data.field(2, "employee.grade")).toEqual({
      kind: "missing",
      missing: [{ field: "employee.grade", reason: "blank" }],
    });
  });

  it("lists approvers from every approver column, marking those not on file", () => {
    const data = dataset([
      tx({ approver_1_id: "E-0002", approver_2_id: "E-9003" }),
      tx({ approver_1_id: "", approver_2_id: "" }),
    ]);
    expect(data.field(0, "approvers[]")).toEqual({
      kind: "list",
      items: [
        { kind: "value", value: "E-0002", raw: "E-0002" },
        { kind: "value", value: "E-9003", raw: "E-9003" },
      ],
    });
    expect(data.field(0, "approvers[].grade")).toEqual({
      kind: "list",
      items: [
        { kind: "value", value: 12, raw: "12" },
        {
          kind: "missing",
          missing: [{ field: "approver_2_id", reason: "not_found", value: "E-9003" }],
        },
      ],
    });
    expect(data.field(1, "approvers[].grade")).toEqual({
      kind: "missing",
      missing: [
        { field: "approver_1_id", reason: "blank" },
        { field: "approver_2_id", reason: "blank" },
      ],
    });
  });

  it("reads approvers from a single list column too", () => {
    const columns = [
      ...TRANSACTION_COLUMNS.filter((column) => column.role !== "approver_ids"),
      {
        file: "transactions",
        name: "approvers",
        position: 20,
        type: "list",
        role: "approver_ids",
        dateFormat: null,
        listDelimiter: "|",
      } as const,
    ];
    const data = dataset([tx({ approvers: "E-0002 | E-9003" })], { columns });
    expect(data.approverIds(0).map(({ id, key }) => [id, key.name])).toEqual([
      ["E-0002", "approvers"],
      ["E-9003", "approvers"],
    ]);
    expect(data.field(0, "approvers[].grade")).toEqual({
      kind: "list",
      items: [
        { kind: "value", value: 12, raw: "12" },
        {
          kind: "missing",
          missing: [{ field: "approvers", reason: "not_found", value: "E-9003" }],
        },
      ],
    });
  });

  it("reads ID columns as text, even when they hold only digits", () => {
    const digits = TRANSACTION_COLUMNS.map((column) =>
      ["employee_id", "requester_id", "approver_ids"].includes(column.role ?? "")
        ? { ...column, type: "integer" as const }
        : column,
    );
    const data = dataset(
      [tx({ employee_id: "0004", requester_id: "0031", approver_1_id: "0031", approver_2_id: "" })],
      {
        columns: digits,
        employees: `employee_id,grade,department,manager_id
0004,7,Finance,0031
0031,9,Finance,
`,
      },
    );
    expect(data.field(0, "requester_id")).toEqual({ kind: "value", value: "0031", raw: "0031" });
    expect(data.field(0, "employee.grade")).toMatchObject({ kind: "value", value: 7 });
    expect(data.managerChain("0004")).toEqual(["0031"]);
  });

  it("refuses field names it cannot resolve", () => {
    const data = dataset([tx()]);
    expect(data.parsePath("salary")).toEqual({
      ok: false,
      problem: "unknown_field",
      detail: "salary",
    });
    expect(data.parsePath("employee.salary")).toEqual({
      ok: false,
      problem: "unknown_field",
      detail: "employee.salary",
    });
    const noApprovers = dataset([tx()], {
      columns: TRANSACTION_COLUMNS.filter((column) => column.role !== "approver_ids"),
    });
    expect(noApprovers.parsePath("approvers[].grade")).toEqual({
      ok: false,
      problem: "missing_role",
      detail: "transactions: approver_ids",
    });
    expect(() => data.field(0, "salary")).toThrow("Unknown field salary");
  });

  it("follows the manager chain and stops at a loop", () => {
    const data = dataset([tx()], {
      employees: `employee_id,grade,department,manager_id
E-0001,15,Executive Office,E-0003
E-0002,12,Finance,E-0001
E-0003,9,Finance,E-0002
E-0004,7,Finance,E-0003
`,
    });
    expect(data.managerChain("E-0004")).toEqual(["E-0003", "E-0002", "E-0001"]);
    expect(data.managerChain("E-0099")).toBeNull();
  });

  it("keeps the first row of a repeated employee ID", () => {
    const data = dataset([tx({ employee_id: "E-0002" })], {
      employees: `employee_id,grade,department,manager_id
E-0002,12,Finance,
E-0002,3,Finance,
`,
    });
    expect(data.field(0, "employee.grade")).toMatchObject({ kind: "value", value: 12 });
  });

  it("finds a person's transactions in a window that ends on a day", () => {
    const data = dataset([
      tx({ transaction_id: "TX-1", effective_date: "2024-03-01" }),
      tx({ transaction_id: "TX-2", effective_date: "2024-09-01" }),
      tx({ transaction_id: "TX-3", effective_date: "2025-03-01" }),
      tx({ transaction_id: "TX-4", effective_date: "2025-03-01", type: "pay_change" }),
      tx({ transaction_id: "TX-5", effective_date: "2025-02-01", employee_id: "E-0006" }),
      tx({ transaction_id: "TX-6", effective_date: "" }),
    ]);
    const column = data.roleColumn("transactions", "employee_id");
    if (!column) throw new Error("employee_id role expected");
    const ids = (types: string[] | null, windowDays: number) =>
      data
        .historyWindow(
          column,
          "E-0004",
          dayNumber("2025-03-01"),
          windowDays,
          types ? new Set(types) : null,
        )
        .map((entry) => entry.transactionId);
    // TX-1 is exactly 365 days back: outside a 365-day window, inside a 366-day one.
    expect(ids(["allowance_change"], 365)).toEqual(["TX-2", "TX-3"]);
    expect(ids(["allowance_change"], 366)).toEqual(["TX-1", "TX-2", "TX-3"]);
    expect(ids(null, 365)).toEqual(["TX-2", "TX-3", "TX-4"]);
  });
});

describe("approval times", () => {
  const data = dataset(
    [
      tx({
        approver_1_at: "2025-02-25 11:00",
        approver_2_id: "E-0005",
        approver_2_at: "2025-02-26 09:30",
      }),
      tx({ approver_1_at: "2025-02-25 11:00", approver_2_id: "", approver_2_at: "" }),
      tx({ approver_1_at: "2025-02-25 11:00", approver_2_id: "E-0005", approver_2_at: "" }),
      tx({ approver_1_id: "", approver_1_at: "", approver_2_id: "", approver_2_at: "" }),
      tx({
        approver_1_at: "2025-02-25 11:00",
        approver_2_id: "",
        approver_2_at: "2025-02-26 09:30",
      }),
    ],
    { columns: APPROVER_TIME_COLUMNS },
  );
  const raws = (index: number) => {
    const resolved = data.field(index, APPROVAL_TIMES);
    if (resolved.kind !== "list") return resolved;
    return resolved.items.map((item) => (item.kind === "value" ? item.raw : item.missing));
  };

  it("lists each approver's time in approver order", () => {
    expect(raws(0)).toEqual(["2025-02-25 11:00", "2025-02-26 09:30"]);
  });

  it("leaves out an approver slot with neither a person nor a time", () => {
    expect(raws(1)).toEqual(["2025-02-25 11:00"]);
  });

  it("marks an approver listed without a time as missing", () => {
    expect(raws(2)).toEqual(["2025-02-25 11:00", [{ field: "approver_2_at", reason: "blank" }]]);
  });

  it("is missing when nobody approved", () => {
    expect(raws(3)).toEqual({
      kind: "missing",
      missing: [
        { field: "approver_1_at", reason: "blank" },
        { field: "approver_2_at", reason: "blank" },
      ],
    });
  });

  it("keeps a time written without its approver", () => {
    expect(raws(4)).toEqual(["2025-02-25 11:00", "2025-02-26 09:30"]);
  });

  it("reads one approval-time column as the transaction's approval time", () => {
    const single = dataset([tx(), tx({ approved_at: "" })]);
    expect(single.field(0, APPROVAL_TIMES)).toMatchObject({
      kind: "list",
      items: [{ kind: "value", raw: "2025-02-25 11:00" }],
    });
    expect(single.field(1, APPROVAL_TIMES)).toMatchObject({
      kind: "list",
      items: [{ kind: "missing", missing: [{ field: "approved_at", reason: "blank" }] }],
    });
  });

  it("names the missing role when the data has no approval time", () => {
    const none = dataset([tx()], {
      columns: TRANSACTION_COLUMNS.filter((column) => column.role !== "approved_at"),
    });
    expect(none.parsePath(APPROVAL_TIMES)).toEqual({
      ok: false,
      problem: "missing_role",
      detail: "transactions: approved_at",
    });
  });
});
