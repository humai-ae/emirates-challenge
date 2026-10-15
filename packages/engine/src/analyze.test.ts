import { describe, expect, it } from "vitest";
import { analyzeDataset, rowsForStorage } from "./analyze.js";
import type { CsvTable } from "./csv.js";

function table(header: string[], rows: string[][], extra: Partial<CsvTable> = {}): CsvTable {
  return { header, rows, delimiter: ",", widthMismatches: [], renamedHeaders: [], ...extra };
}

const employees = table(
  ["employee_id", "grade", "department", "location", "manager_id", "hire_date", "exit_date"],
  [
    ["E-0001", "15", "Executive Office", "Dubai", "", "2005-03-01", ""],
    ["E-0002", "12", "Finance", "Dubai", "E-0001", "2010-06-15", ""],
    ["E-0003", "9", "Finance", "Abu Dhabi", "E-0002", "2016-01-10", ""],
    ["E-0004", "7", "Finance", "Dubai", "E-0003", "2019-09-01", "2025-08-31"],
    ["E-0005", "10", "Cabin Services", "Sharjah", "E-0001", "2012-11-20", ""],
    ["E-0006", "6", "Cabin Services", "Dubai", "E-0005", "2021-04-04", ""],
  ],
);

const HEADER = [
  "transaction_id",
  "type",
  "employee_id",
  "amount",
  "currency",
  "effective_date",
  "requester_id",
  "approver_1_id",
  "approver_2_id",
  "submitted_at",
  "approved_at",
  "documents",
  "justification",
];
const ROWS = [
  [
    "TX-000001",
    "allowance_change",
    "E-0004",
    "12000",
    "AED",
    "2025-03-01",
    "E-0003",
    "E-0002",
    "E-0001",
    "2025-02-20 09:10",
    "2025-02-25 11:00",
    "allowance_form",
    "Market adjustment",
  ],
  [
    "TX-000002",
    "pay_change",
    "E-0003",
    "4000",
    "AED",
    "2025-04-01",
    "E-0002",
    "E-0001",
    "",
    "2025-03-15 10:00",
    "2025-03-20 15:30",
    "pay_change_form",
    "Annual review",
  ],
  [
    "TX-000003",
    "exit",
    "E-0004",
    "",
    "",
    "2025-08-31",
    "E-0003",
    "E-0002",
    "",
    "2025-08-01 08:45",
    "2025-08-05 09:00",
    "resignation_letter;clearance_form",
    "",
  ],
  [
    "TX-000004",
    "overtime",
    "E-0006",
    "800",
    "AED",
    "2025-05-10",
    "E-0005",
    "",
    "",
    "2025-05-11 12:00",
    "2025-05-12 13:00",
    "timesheet",
    "Peak season cover",
  ],
  [
    "TX-000005",
    "overtime",
    "E-0006",
    "650",
    "AED",
    "2025-06-10",
    "E-0005",
    "E-9001",
    "",
    "2025-06-11 12:00",
    "2025-06-12 13:00",
    "timesheet",
    "Peak season cover",
  ],
];

describe("analyzeDataset", () => {
  it("reports a ready dataset with counts, period and the issues a user needs before a run", () => {
    const analysis = analyzeDataset({ transactions: table(HEADER, ROWS), employees });
    expect(analysis).toMatchObject({
      status: "ready",
      rejection: null,
      summary: {
        transactionCount: 5,
        employeeCount: 6,
        periodFrom: "2025-03-01",
        periodTo: "2025-08-31",
      },
    });
    expect(analysis.issues).toEqual([
      {
        code: "blank_values",
        file: "transactions",
        column: "approver_1_id, approver_2_id",
        role: "approver_ids",
        count: 1,
        examples: ["TX-000004"],
      },
      {
        code: "unknown_employee",
        file: "transactions",
        column: "approver_1_id, approver_2_id",
        role: "approver_ids",
        count: 1,
        examples: ["E-9001"],
      },
    ]);
  });

  it("lists duplicate IDs, repeated headers and rows of the wrong width", () => {
    const rows = [
      ...ROWS,
      [
        "TX-000005",
        "allowance_change",
        "E-0003",
        "2500",
        "AED",
        "2025-07-01",
        "E-0002",
        "E-0001",
        "",
        "2025-06-20 09:00",
        "2025-06-25 10:00",
        "allowance_form",
        "Housing",
      ],
    ];
    const analysis = analyzeDataset({
      transactions: table(HEADER, rows, { widthMismatches: [3], renamedHeaders: ["notes_2"] }),
      employees,
    });
    expect(analysis.issues.slice(0, 3)).toEqual([
      {
        code: "wrong_column_count",
        file: "transactions",
        column: null,
        role: null,
        count: 1,
        examples: ["#3"],
      },
      {
        code: "duplicate_header",
        file: "transactions",
        column: null,
        role: null,
        count: 1,
        examples: ["notes_2"],
      },
      {
        code: "duplicate_id",
        file: "transactions",
        column: "transaction_id",
        role: "transaction_id",
        count: 1,
        examples: ["TX-000005"],
      },
    ]);
  });

  it("names values that don't parse in a role column", () => {
    const rows = Array.from({ length: 12 }, (_, index) => [
      `TX-${index + 1}`,
      "overtime",
      "E-0006",
      index === 4 ? "n/a" : String(100 + index),
      "2025-05-10",
      "E-0005",
      "E-0002",
    ]);
    const analysis = analyzeDataset({
      transactions: table(
        [
          "transaction_id",
          "type",
          "employee_id",
          "amount",
          "effective_date",
          "requester_id",
          "approver_id",
        ],
        rows,
      ),
      employees,
    });
    expect(analysis.issues).toContainEqual({
      code: "invalid_values",
      file: "transactions",
      column: "amount",
      role: "amount",
      count: 1,
      examples: ["n/a"],
    });
  });

  it("flags an ambiguous date column instead of guessing silently", () => {
    const dates = ["03/04/2025", "05/06/2025", "07/08/2025", "09/10/2025", "11/12/2025"];
    const rows = ROWS.map((row, index) => [
      row[0] ?? "",
      row[1] ?? "",
      row[2] ?? "",
      dates[index] ?? "",
    ]);
    const analysis = analyzeDataset({
      transactions: table(["transaction_id", "type", "employee_id", "effective_date"], rows),
      employees,
    });
    expect(analysis.issues).toContainEqual({
      code: "ambiguous_date_format",
      file: "transactions",
      column: "effective_date",
      role: "effective_date",
      count: 5,
      examples: dates,
    });
    expect(analysis.summary.periodFrom).toBe("2025-04-03");
  });

  it("rejects a dataset without a transaction ID column, and accepts the admin's fix", () => {
    const transactions = table(
      ["foo", "bar"],
      [
        ["A-1", "x"],
        ["A-2", "y"],
      ],
    );
    expect(analyzeDataset({ transactions, employees })).toMatchObject({
      status: "rejected",
      rejection: "no_transaction_id",
    });
    const fixed = analyzeDataset({
      transactions,
      employees,
      roles: {
        transactions: { transaction_id: ["foo"] },
        employees: { employee_id: ["employee_id"] },
      },
    });
    expect(fixed).toMatchObject({ status: "ready", rejection: null });
    expect(fixed.roles.transactions).toEqual([
      { role: "transaction_id", columns: ["foo"], score: 1, confident: true, confirmed: true },
    ]);
  });

  it("prepares rows for storage with the effective date normalised", () => {
    const input = {
      transactions: table(
        ["transaction_id", "type", "employee_id", "effective_date"],
        [["TX-1", "exit", "E-0004", "31/08/2025"]],
      ),
      employees,
    };
    const rows = rowsForStorage(analyzeDataset(input), input);
    expect(rows.transactions).toEqual([
      {
        rowNo: 1,
        transactionId: "TX-1",
        type: "exit",
        employeeId: "E-0004",
        effectiveDate: "2025-08-31",
        data: {
          transaction_id: "TX-1",
          type: "exit",
          employee_id: "E-0004",
          effective_date: "31/08/2025",
        },
      },
    ]);
    expect(rows.employees[0]).toMatchObject({ rowNo: 1, employeeId: "E-0001" });
  });

  it("analyses 10,000 rows quickly", () => {
    const people = table(
      ["employee_id", "grade", "department"],
      Array.from({ length: 2000 }, (_, index) => [
        `E-${String(index + 1).padStart(4, "0")}`,
        String((index % 15) + 1),
        `Dept ${index % 10}`,
      ]),
    );
    const transactions = table(
      [
        "transaction_id",
        "type",
        "employee_id",
        "amount",
        "effective_date",
        "requester_id",
        "approver_1_id",
        "approver_2_id",
      ],
      Array.from({ length: 10_000 }, (_, index) => [
        `TX-${String(index + 1).padStart(6, "0")}`,
        ["allowance_change", "pay_change", "overtime"][index % 3] ?? "overtime",
        `E-${String((index % 2000) + 1).padStart(4, "0")}`,
        String(100 + (index % 9000)),
        `2025-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
        `E-${String(((index + 7) % 2000) + 1).padStart(4, "0")}`,
        `E-${String(((index + 13) % 2000) + 1).padStart(4, "0")}`,
        index % 4 === 0 ? `E-${String(((index + 29) % 2000) + 1).padStart(4, "0")}` : "",
      ]),
    );
    const started = performance.now();
    const analysis = analyzeDataset({ transactions, employees: people });
    expect(performance.now() - started).toBeLessThan(3000);
    expect(analysis).toMatchObject({ status: "ready", summary: { transactionCount: 10_000 } });
  });
});
