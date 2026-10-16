import { describe, expect, it } from "vitest";
import {
  ConfirmRolesRequestSchema,
  DataIssueSchema,
  DatasetDetailSchema,
  EMPLOYEE_ROLES,
  TRANSACTION_ROLES,
  UploadDatasetFieldsSchema,
} from "./index.js";

const detail = {
  id: "5d9b5c1e-3f0a-4c8e-9a71-2b6f4e8d1c30",
  name: "Training pack",
  status: "ready",
  rejection: null,
  transactionCount: 300,
  employeeCount: 60,
  periodFrom: "2025-01-02",
  periodTo: "2025-12-30",
  issueCount: 1,
  columnsConfirmed: false,
  createdAt: "2026-10-15T09:00:00.000Z",
  createdBy: "Layla Haddad",
  files: [
    {
      kind: "transactions",
      filename: "transactions.csv",
      sizeBytes: 40210,
      sha256: "a".repeat(64),
    },
  ],
  columns: [
    {
      file: "transactions",
      name: "approver_1_id",
      position: 9,
      type: "id",
      role: "approver_ids",
      roleConfident: true,
      roleConfirmed: false,
      blankCount: 2,
      distinctCount: 31,
      invalidCount: 0,
      samples: ["E-0012", "E-0007"],
      min: null,
      max: null,
      dateFormat: null,
      dateAmbiguous: false,
      listDelimiter: null,
    },
  ],
  issues: [
    {
      code: "unknown_employee",
      file: "transactions",
      column: "approver_1_id",
      role: "approver_ids",
      count: 3,
      examples: ["E-9001", "E-9002", "E-9003"],
    },
  ],
};

describe("dataset contracts", () => {
  it("lists the roles a column can play in each file", () => {
    expect(TRANSACTION_ROLES).toContain("approver_ids");
    expect(EMPLOYEE_ROLES).toEqual([
      "employee_id",
      "grade",
      "department",
      "location",
      "manager_id",
      "hire_date",
      "exit_date",
    ]);
  });

  it("parses a dataset detail", () => {
    expect(DatasetDetailSchema.parse(detail)).toEqual(detail);
  });

  it("keeps at most five examples on an issue", () => {
    const issue = { ...detail.issues[0], examples: ["1", "2", "3", "4", "5", "6"] };
    expect(DataIssueSchema.safeParse(issue).success).toBe(false);
  });

  it("accepts a partial role mapping and refuses unknown roles", () => {
    expect(
      ConfirmRolesRequestSchema.parse({
        transactions: { transaction_id: ["txn_ref"], approver_ids: ["approver_1", "approver_2"] },
        employees: { employee_id: ["id"] },
      }).transactions.approver_ids,
    ).toEqual(["approver_1", "approver_2"]);
    expect(
      ConfirmRolesRequestSchema.safeParse({
        transactions: { salary: ["pay"] },
        employees: {},
      }).success,
    ).toBe(false);
  });

  it("allows several columns only for approvers and their times, and each column only once", () => {
    const messages = (input: unknown) => {
      const result = ConfirmRolesRequestSchema.safeParse(input);
      return result.success
        ? []
        : result.error.issues.map((issue) => `${issue.path.join(".")}:${issue.message}`);
    };
    expect(messages({ transactions: { transaction_id: ["ref", "ref_2"] }, employees: {} })).toEqual(
      ["transactions.transaction_id:one_column_only"],
    );
    expect(
      messages({
        transactions: { employee_id: ["staff"], requester_id: ["staff"] },
        employees: { employee_id: ["staff"] },
      }),
    ).toEqual(["transactions.requester_id:column_reused"]);
  });

  it("lets approval times span several columns, like approvers", () => {
    const result = ConfirmRolesRequestSchema.safeParse({
      transactions: {
        approver_ids: ["approver_1_id", "approver_2_id"],
        approved_at: ["approver_1_at", "approver_2_at"],
      },
      employees: {},
    });
    expect(result.success).toBe(true);
  });

  it("reads the upload's text fields", () => {
    expect(UploadDatasetFieldsSchema.parse({ name: "  Test file  " })).toEqual({
      name: "Test file",
    });
    expect(UploadDatasetFieldsSchema.safeParse({ employeesFromDatasetId: "nope" }).success).toBe(
      false,
    );
  });
});
