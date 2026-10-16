import type { Expression, ParameterValue } from "@hrcc/shared";
import { describe, expect, it } from "vitest";
import { type Entry, EvaluationError, evaluate, type Result, Unknown } from "./interpreter.js";
import { dataset, tx } from "./testing/dataset.js";

const data = dataset([
  tx({
    transaction_id: "TX-1",
    amount: "16200",
    effective_date: "2025-02-20",
    submitted_at: "2025-02-10 09:00",
    approved_at: "2025-02-27 11:00",
    approver_1_id: "E-0007",
    approver_2_id: "E-9003",
    documents: "resignation_letter",
    justification: "",
  }),
  tx({
    transaction_id: "TX-2",
    amount: "",
    requester_id: "",
    approver_1_id: "",
    approver_2_id: "",
    documents: "",
  }),
  tx({
    transaction_id: "TX-3",
    amount: "AED 5k",
    employee_id: "E-0099",
    effective_date: "2025-02-27",
    submitted_at: "2025-02-27 09:00",
    approved_at: "2025-02-27 11:00",
    requester_id: "E-0002",
    approver_1_id: "E-0002",
  }),
]);

function run(
  expression: Expression,
  options: { row?: number; params?: Record<string, ParameterValue>; element?: Entry } = {},
): Result {
  return evaluate(expression, {
    dataset: data,
    rowIndex: options.row ?? 0,
    params: new Map(Object.entries(options.params ?? {})),
    element: options.element,
  });
}

const blank = (field: string) => new Unknown([{ field, reason: "blank" }]);
const amountOver = (limit: number) => ({ ">": [{ var: "amount" }, limit] });
const grades = { var: "approvers[].grade" };
const atLeast = (grade: number) => ({ ">=": [{ var: "" }, grade] });
const approverNotOnFile = new Unknown([
  { field: "approver_2_id", reason: "not_found", value: "E-9003" },
]);

describe("evaluate", () => {
  it("combines true, false and unknown the way missing data needs", () => {
    expect(run({ and: [true, amountOver(1)] }, { row: 1 })).toEqual(blank("amount"));
    expect(run({ and: [false, amountOver(1)] }, { row: 1 })).toBe(false);
    expect(run({ or: [true, amountOver(1)] }, { row: 1 })).toBe(true);
    expect(run({ or: [false, amountOver(1)] }, { row: 1 })).toEqual(blank("amount"));
    expect(run({ "!": amountOver(1) }, { row: 1 })).toEqual(blank("amount"));
    expect(run({ "!": [amountOver(20000)] })).toBe(true);
  });

  it("chooses with if", () => {
    const size = { if: [amountOver(20000), "large", amountOver(10000), "medium", "small"] };
    expect(run(size)).toBe("medium");
    expect(run(size, { row: 1 })).toEqual(blank("amount"));
  });

  it("compares numbers, text and dates, by day unless both have times", () => {
    expect(run({ "==": [{ var: "type" }, "allowance_change"] })).toBe(true);
    expect(run({ ">": [{ var: "approved_at" }, { var: "effective_date" }] })).toBe(true);
    expect(run({ "==": [{ var: "approved_at" }, { var: "effective_date" }] }, { row: 2 })).toBe(
      true,
    );
    expect(run({ "<": [{ var: "submitted_at" }, { var: "approved_at" }] }, { row: 2 })).toBe(true);
  });

  it("refuses comparisons that make no sense", () => {
    expect(() => run({ ">": [{ var: "type" }, 5] })).toThrow("> cannot compare text with a number");
    expect(() => run({ ">": [grades, 5] })).toThrow("use some, all or none for a list");
  });

  it("tests membership and ranges", () => {
    expect(run({ in: [{ var: "type" }, ["allowance_change", "pay_change"]] })).toBe(true);
    expect(
      run({ in: [{ var: "type" }, { param: "types" }] }, { params: { types: ["exit"] } }),
    ).toBe(false);
    expect(run({ between: [{ var: "amount" }, 10000, 20000] })).toBe(true);
  });

  it("reads fields, joined fields and the current list element", () => {
    expect(run(grades)).toEqual([8, approverNotOnFile]);
    expect(run({ var: "employee.grade" })).toBe(7);
    expect(run({ var: "" }, { element: 9 })).toBe(9);
    expect(() => run({ var: "" })).toThrow("only inside some, all, none or count");
    expect(() => run({ var: "salary" })).toThrow("unknown field salary");
  });

  it("uses parameter values and refuses unknown or unset ones", () => {
    expect(run({ param: "limit" }, { params: { limit: 10000 } })).toBe(10000);
    expect(() => run({ param: "limit" })).toThrow("unknown parameter limit");
    expect(() => run({ param: "limit" }, { params: { limit: null } })).toThrow(
      "parameter limit is not set",
    );
  });

  it("looks through lists with some, all and none, honouring unknown elements", () => {
    expect(run({ some: [grades, atLeast(8)] })).toBe(true);
    expect(run({ some: [grades, atLeast(10)] })).toEqual(approverNotOnFile);
    expect(run({ all: [grades, atLeast(9)] })).toBe(false);
    expect(run({ all: [grades, atLeast(8)] })).toEqual(approverNotOnFile);
    expect(run({ none: [grades, atLeast(10)] })).toEqual(approverNotOnFile);
    expect(run({ none: [grades, atLeast(8)] })).toBe(false);
    expect(run({ some: [grades, atLeast(8)] }, { row: 1 })).toEqual(
      new Unknown([
        { field: "approver_1_id", reason: "blank" },
        { field: "approver_2_id", reason: "blank" },
      ]),
    );
  });

  it("counts and finds extremes", () => {
    expect(run({ count: [{ var: "approvers[]" }] })).toBe(2);
    expect(run({ count: [["a", "b", "a"], { "==": [{ var: "" }, "a"] }] })).toBe(2);
    expect(run({ max: [[3, 9, 4]] })).toBe(9);
    expect(run({ min: [grades] })).toEqual(approverNotOnFile);
    expect(() => run({ max: [[]] })).toThrow("max of an empty list");
  });

  it("lists required items that are missing, treating a blank list as empty", () => {
    const required = ["resignation_letter", "clearance_form"];
    expect(run({ missing_from: [{ var: "documents" }, required] })).toEqual(["clearance_form"]);
    expect(run({ missing_from: [{ var: "documents" }, required] }, { row: 1 })).toEqual(required);
    expect(run({ missing_from: ["a | clearance_form", required] })).toEqual(["resignation_letter"]);
  });

  it("works with days, working days, hours and weekdays", () => {
    expect(run({ days_between: [{ var: "effective_date" }, { var: "approved_at" }] })).toBe(7);
    // Thursday to the next Thursday: Friday and Monday to Thursday.
    expect(run({ working_days_between: [{ var: "effective_date" }, { var: "approved_at" }] })).toBe(
      5,
    );
    expect(run({ hour_of: { var: "approved_at" } })).toBe(11);
    expect(run({ weekday_of: { var: "effective_date" } })).toBe(4);
    expect(() => run({ hour_of: { var: "effective_date" } })).toThrow(
      "hour_of needs a date with a time",
    );
  });

  it("tells blank from unreadable and unknown", () => {
    expect(run({ is_blank: { var: "justification" } })).toBe(true);
    expect(run({ is_blank: { var: "amount" } })).toBe(false);
    // "AED 5k" is filled in; it just doesn't read as a number.
    expect(run({ is_blank: { var: "amount" } }, { row: 2 })).toBe(false);
    expect(run({ is_blank: { var: "employee.grade" } }, { row: 2 })).toEqual(
      new Unknown([{ field: "employee_id", reason: "not_found", value: "E-0099" }]),
    );
  });

  it("compares people and follows the manager chain", () => {
    const selfApproved = { same_person: [{ var: "requester_id" }, { var: "approver_1_id" }] };
    expect(run(selfApproved, { row: 2 })).toBe(true);
    expect(run(selfApproved)).toBe(false);
    expect(run({ in_manager_chain: [{ var: "employee_id" }, "E-0002"] })).toBe(true);
    expect(run({ in_manager_chain: [{ var: "employee_id" }, "E-0005"] })).toBe(false);
    expect(run({ in_manager_chain: [{ var: "employee_id" }, "E-0002"] }, { row: 2 })).toEqual(
      new Unknown([{ field: "employee_id", reason: "not_found", value: "E-0099" }]),
    );
  });

  it("counts and sums a person's history", () => {
    const history = dataset([
      tx({ transaction_id: "TX-1", effective_date: "2025-01-10", amount: "1000" }),
      tx({ transaction_id: "TX-2", effective_date: "2025-05-10", amount: "2000" }),
      tx({ transaction_id: "TX-3", effective_date: "2025-09-10", amount: "3000" }),
      tx({
        transaction_id: "TX-4",
        effective_date: "2025-09-10",
        amount: "",
        employee_id: "E-0006",
      }),
      tx({ transaction_id: "TX-5", effective_date: "2025-09-11", employee_id: "E-0006" }),
      tx({ transaction_id: "TX-6", effective_date: "2025-09-12", employee_id: "" }),
    ]);
    const at = (rowIndex: number, expression: Expression) =>
      evaluate(expression, { dataset: history, rowIndex, params: new Map() });
    const count = { history_count: [{ var: "employee_id" }, ["allowance_change"], 365] };
    const sum = {
      history_sum: [{ var: "employee_id" }, ["allowance_change"], 365, { var: "amount" }],
    };
    expect(at(2, count)).toBe(3);
    expect(at(1, count)).toBe(2);
    expect(at(2, sum)).toBe(6000);
    expect(at(4, sum)).toEqual(blank("amount"));
    expect(at(5, count)).toEqual(blank("employee_id"));
  });

  it("refuses anything outside the allowed operators, even if validation was skipped", () => {
    expect(() => run({ regex: ["a"] })).toThrow(EvaluationError);
    expect(() => run({ constructor: [1] })).toThrow("not an allowed operator: constructor");
    expect(() => run({ ">": [1, 2], "<": [1, 2] })).toThrow(EvaluationError);
    expect(() => run(null)).toThrow("null is not a value");
  });
});

describe("in_order", () => {
  const times = dataset([
    tx({ submitted_at: "2025-02-20 09:10", approved_at: "2025-02-25 11:00" }),
    tx({ submitted_at: "2025-02-27 11:00", approved_at: "2025-02-27 09:00" }),
    tx({ submitted_at: "2025-02-20 09:10", approved_at: "" }),
  ]);
  const at = (row: number, expression: Expression) =>
    evaluate(expression, { dataset: times, rowIndex: row, params: new Map() });
  const inOrder = { in_order: [{ var: "submitted_at" }, { var: "approved_at" }] };

  it("is true when the times never go back", () => {
    expect(at(0, inOrder)).toBe(true);
  });

  it("compares two times on the same day by the minute", () => {
    expect(at(1, inOrder)).toBe(false);
  });

  it("is unknown when a time is missing", () => {
    expect(at(2, inOrder)).toEqual(new Unknown([{ field: "approved_at", reason: "blank" }]));
  });

  it("is false when known times already go back, whatever is missing between them", () => {
    const back = {
      in_order: [{ var: "approved_at" }, { var: "approved_at" }, { var: "submitted_at" }],
    };
    expect(at(0, back)).toBe(false);
  });
});
