import { describe, expect, it } from "vitest";
import type { CsvTable } from "./csv.js";
import { profileTable } from "./profile.js";
import { assignRoles, type RoleAssignment } from "./roles.js";

function table(header: string[], rows: string[][]): CsvTable {
  return { header, rows, delimiter: ",", widthMismatches: [], renamedHeaders: [] };
}

const TRANSACTION_ROWS = [
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
const SAMPLE_HEADER = [
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
const EMPLOYEE_IDS = new Set(["E-0001", "E-0002", "E-0003", "E-0004", "E-0005", "E-0006"]);

function roleMap(assignments: RoleAssignment[]): Record<string, string[]> {
  return Object.fromEntries(assignments.map((assignment) => [assignment.role, assignment.columns]));
}

function assign(header: string[], rows: string[][]) {
  const data = table(header, rows);
  return assignRoles("transactions", data, profileTable(data), { employeeIds: EMPLOYEE_IDS });
}

describe("assignRoles", () => {
  it("assigns the sample columns confidently", () => {
    const assignments = assign(SAMPLE_HEADER, TRANSACTION_ROWS);
    expect(roleMap(assignments)).toEqual({
      transaction_id: ["transaction_id"],
      type: ["type"],
      employee_id: ["employee_id"],
      requester_id: ["requester_id"],
      approver_ids: ["approver_1_id", "approver_2_id"],
      amount: ["amount"],
      currency: ["currency"],
      effective_date: ["effective_date"],
      submitted_at: ["submitted_at"],
      approved_at: ["approved_at"],
      documents: ["documents"],
      text: ["justification"],
    });
    expect(assignments.every((assignment) => assignment.confident && !assignment.confirmed)).toBe(
      true,
    );
  });

  it("groups each approver's approval time into one role", () => {
    const assignments = assign(
      [
        "transaction_id",
        "type",
        "employee_id",
        "requester_id",
        "approver_1_id",
        "approver_1_at",
        "approver_2_id",
        "approver_2_at",
        "requested_at",
      ],
      [
        [
          "TX-1",
          "pay_change",
          "E-0004",
          "E-0003",
          "E-0002",
          "2025-01-02T10:00",
          "E-0001",
          "2025-01-03T09:00",
          "2025-01-01T09:00",
        ],
        [
          "TX-2",
          "pay_change",
          "E-0004",
          "E-0003",
          "E-0002",
          "2025-02-02T10:00",
          "",
          "",
          "2025-02-01T09:00",
        ],
      ],
    );
    expect(assignments.find((item) => item.role === "approved_at")).toMatchObject({
      columns: ["approver_1_at", "approver_2_at"],
      confident: true,
    });
    expect(roleMap(assignments).submitted_at).toEqual(["requested_at"]);
  });

  it("finds roles under different column names", () => {
    const header = [
      "Txn Ref",
      "Transaction Type",
      "Employee",
      "Amount (AED)",
      "Currency",
      "Eff. Date",
      "Requested By",
      "Approver 1",
      "Approver 2",
      "Submitted On",
      "Approved On",
      "Attachments",
      "Business Reason",
    ];
    expect(roleMap(assign(header, TRANSACTION_ROWS))).toEqual({
      transaction_id: ["Txn Ref"],
      type: ["Transaction Type"],
      employee_id: ["Employee"],
      requester_id: ["Requested By"],
      approver_ids: ["Approver 1", "Approver 2"],
      amount: ["Amount (AED)"],
      currency: ["Currency"],
      effective_date: ["Eff. Date"],
      submitted_at: ["Submitted On"],
      approved_at: ["Approved On"],
      documents: ["Attachments"],
      text: ["Business Reason"],
    });
  });

  it("uses employee IDs to suggest a vaguely named column, without claiming confidence", () => {
    const assignments = assign(
      ["transaction_id", "person", "amount"],
      [
        ["TX-1", "E-0001", "100"],
        ["TX-2", "E-0002", "200"],
        ["TX-3", "E-0003", "300"],
      ],
    );
    expect(assignments.find((assignment) => assignment.role === "employee_id")).toMatchObject({
      columns: ["person"],
      confident: false,
    });
  });

  it("returns exactly the admin's choices, in column order", () => {
    const data = table(["txn", "b1", "b2"], [["TX-1", "E-0001", "E-0002"]]);
    expect(
      assignRoles(
        "transactions",
        data,
        profileTable(data),
        {},
        {
          transaction_id: ["txn"],
          approver_ids: ["b2", "b1"],
        },
      ),
    ).toEqual([
      { role: "transaction_id", columns: ["txn"], score: 1, confident: true, confirmed: true },
      { role: "approver_ids", columns: ["b1", "b2"], score: 1, confident: true, confirmed: true },
    ]);
  });

  it("leaves a role unassigned when nothing fits", () => {
    const assignments = assign(["foo", "bar"], [["x", "y"]]);
    expect(assignments.find((assignment) => assignment.role === "transaction_id")).toBeUndefined();
  });
});
