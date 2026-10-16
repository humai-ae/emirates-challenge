import type { Expression } from "@hrcc/shared";
import { describe, expect, it } from "vitest";
import { dataset, TRANSACTION_COLUMNS, tx } from "./testing/dataset.js";
import { validateCheck } from "./validate.js";

const data = dataset([tx()]);

const base = {
  checkKind: "structured",
  preset: "approver_min_grade",
  appliesTo: { in: [{ var: "type" }, { param: "types" }] },
  logic: {
    and: [
      { ">": [{ var: "amount" }, { param: "amount_limit" }] },
      {
        none: [
          { var: "approvers[].grade" },
          { ">=": [{ var: "" }, { param: "min_approver_grade" }] },
        ],
      },
    ],
  },
  fieldsUsed: ["amount", "approvers[].grade", "type"],
  parameters: [
    { name: "types", type: "string[]", value: ["allowance_change"], editedByAdmin: false },
    { name: "amount_limit", type: "number", value: 10000, editedByAdmin: false },
    { name: "min_approver_grade", type: "integer", value: 10, editedByAdmin: false },
  ],
};

/** The base check with other logic; `type` (from appliesTo) is always among the fields. */
const withLogic = (logic: Expression | undefined, fieldsUsed: string[] = ["type"]) => ({
  ...base,
  logic,
  fieldsUsed,
});

function issues(check: unknown, on = data): string[] {
  const result = validateCheck(check, on);
  return result.ok ? [] : result.issues.map((issue) => `${issue.code} ${issue.detail}`);
}

describe("validateCheck", () => {
  it("accepts a check that uses known fields and parameters", () => {
    const result = validateCheck(base, data);
    expect(result.ok).toBe(true);
    expect(result.ok && result.fieldsUsed).toEqual(["amount", "approvers[].grade", "type"]);
  });

  it("refuses operators outside the allowed list", () => {
    expect(issues(withLogic({ regex: [{ var: "amount" }, "^1"] }))).toEqual([
      "unknown_operator regex",
    ]);
    expect(issues(withLogic({ "+": [1, 2] }))).toEqual(["unknown_operator +"]);
  });

  it("refuses the wrong number of arguments", () => {
    expect(issues(withLogic({ ">": [{ var: "amount" }] }))).toEqual([
      "bad_arguments > takes 2 arguments",
    ]);
    expect(issues(withLogic({ if: [true, false] }))).toEqual([
      "bad_arguments if takes 3 to 21 arguments",
    ]);
  });

  it("names fields that are not in the data", () => {
    expect(issues(withLogic({ ">": [{ var: "salary" }, 1] }))).toEqual(["unknown_field salary"]);
  });

  it("names a role the data lacks", () => {
    const noRequester = dataset([tx()], {
      columns: TRANSACTION_COLUMNS.filter((column) => column.role !== "requester_id"),
    });
    expect(issues(withLogic({ ">": [{ var: "requester.grade" }, 1] }), noRequester)).toEqual([
      "missing_role transactions: requester_id",
    ]);
  });

  it("refuses unknown and repeated parameters", () => {
    expect(
      issues(withLogic({ ">": [{ var: "amount" }, { param: "limit" }] }, ["amount", "type"])),
    ).toEqual(["unknown_parameter limit"]);
    const repeated = { ...base, parameters: [...base.parameters, base.parameters[1]] };
    expect(issues(repeated)).toEqual(["duplicate_parameter amount_limit"]);
  });

  it("allows the current element only inside some, all, none or count", () => {
    expect(issues(withLogic({ ">=": [{ var: "" }, 10] }))).toEqual([
      "element_outside_list the current element exists only inside some, all, none or count",
    ]);
  });

  it("refuses nulls, nested lists and parts with two operators", () => {
    expect(issues(withLogic({ "==": [{ var: "amount" }, null] }, ["amount", "type"]))).toEqual([
      "bad_arguments null is not a value",
    ]);
    expect(issues(withLogic({ in: [{ var: "type" }, [{ var: "amount" }]] }))).toEqual([
      "bad_arguments lists hold plain values only",
    ]);
    expect(issues(withLogic({ ">": [1, 2], "<": [1, 2] }))).toEqual([
      "bad_arguments each part has exactly one operator",
    ]);
  });

  it("limits how large a check can be", () => {
    let deep: Expression = { var: "amount" };
    for (let level = 0; level < 30; level += 1) deep = { "!": [deep] };
    expect(issues(withLogic(deep))).toEqual(["too_complex at most 24 levels and 400 parts"]);
  });

  it("checks the declared fields against the fields used", () => {
    expect(issues({ ...base, fieldsUsed: ["amount"] })).toEqual([
      "fields_used_mismatch amount, approvers[].grade, type",
    ]);
  });

  it("needs duplicates to compare plain columns, reading submitted times when there are some", () => {
    const duplicates = { history_duplicates: [{ var: "employee_id" }, 7, { var: "amount" }] };
    const fields = ["amount", "effective_date", "employee_id", "submitted_at", "type"];
    expect(issues(withLogic({ ">": [duplicates, 0] }, fields))).toEqual([]);
    const joined = { history_duplicates: [{ var: "employee_id" }, 7, { var: "employee.grade" }] };
    expect(
      issues(
        withLogic({ ">": [joined, 0] }, ["effective_date", "employee_id", "submitted_at", "type"]),
      ),
    ).toEqual(['bad_arguments needs a transactions column, written {"var": "<column>"}']);
  });

  it("needs history to count over a plain column, with dates and types", () => {
    const count = { history_count: [{ var: "employee_id" }, ["allowance_change"], 365] };
    expect(
      issues(withLogic({ ">": [count, 2] }, ["effective_date", "employee_id", "type"])),
    ).toEqual([]);
    const joined = { history_count: [{ var: "employee.grade" }, ["allowance_change"], 365] };
    expect(issues(withLogic({ ">": [joined, 2] }, ["effective_date", "type"]))).toEqual([
      'bad_arguments needs a transactions column, written {"var": "<column>"}',
    ]);
  });

  it("reports a shape that is not a check", () => {
    expect(issues(withLogic(undefined))[0]).toMatch(/^invalid_shape /);
  });
});
