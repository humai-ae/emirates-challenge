import { describe, expect, it } from "vitest";
import { check, evaluations, nearMiss, param } from "../testing/checks.js";
import { dataset, TRANSACTION_COLUMNS, tx } from "../testing/dataset.js";

describe("approver_min_grade", () => {
  const parameters = [
    param("types", "string[]", ["allowance_change"]),
    param("amount_limit", "number", 10000),
    param("min_approver_grade", "integer", 10),
  ];

  it("flags a large allowance change with no approver at the grade", () => {
    const data = dataset([
      tx({ amount: "16200", approver_1_id: "E-0007", approver_2_id: "" }),
      tx({ amount: "16200", approver_1_id: "E-0007", approver_2_id: "E-0002" }),
      tx({ amount: "9000", approver_1_id: "E-0007" }),
    ]);
    const built = check(data, "approver_min_grade", parameters);
    expect(built.fieldsUsed).toEqual(["amount", "approvers[].grade", "type"]);
    const results = evaluations(data, built);
    expect(results.map((result) => result.outcome)).toEqual(["flagged", "passed", "passed"]);
    expect(results[0]?.evidence).toEqual([
      { field: "amount", value: "16200", condition: "> 10000" },
      { field: "approvers[].grade", value: ["8"], condition: "none >= 10" },
    ]);
  });

  it("can't check approvers missing from the employees file, unless another approver qualifies", () => {
    const data = dataset([
      tx({ amount: "16200", approver_1_id: "E-9003", approver_2_id: "" }),
      tx({ amount: "16200", approver_1_id: "E-9003", approver_2_id: "E-0002" }),
      tx({ amount: "16200", approver_1_id: "", approver_2_id: "" }),
      tx({ amount: "9000", approver_1_id: "E-9003" }),
    ]);
    const results = evaluations(data, check(data, "approver_min_grade", parameters));
    expect(results.map((result) => result.outcome)).toEqual([
      "could_not_check",
      "passed",
      "could_not_check",
      "passed",
    ]);
    expect(results[0]?.missing).toEqual([
      { field: "approver_1_id", reason: "not_found", value: "E-9003" },
    ]);
    expect(results[2]?.missing).toEqual([
      { field: "approver_1_id", reason: "blank" },
      { field: "approver_2_id", reason: "blank" },
    ]);
  });

  it("points out amounts just under the limit and approvers just at the grade", () => {
    const data = dataset([
      tx({ amount: "9600", approver_1_id: "E-0007", approver_2_id: "" }),
      tx({ amount: "12000", approver_1_id: "E-0005", approver_2_id: "" }),
      tx({ amount: "12000", approver_1_id: "E-0002", approver_2_id: "" }),
    ]);
    const built = check(data, "approver_min_grade", parameters);
    expect(nearMiss(data, built, 0)).toEqual({
      reason: "amount_just_under_limit",
      facts: [
        { field: "amount", value: "9600", condition: "<= 10000" },
        { field: "approvers[].grade", value: ["8"], condition: "none >= 10" },
      ],
    });
    expect(nearMiss(data, built, 1)).toEqual({
      reason: "approver_at_minimum_grade",
      facts: [
        { field: "amount", value: "12000", condition: "> 10000" },
        { field: "approvers[].grade", value: ["10"], condition: "max == 10" },
      ],
    });
    expect(nearMiss(data, built, 2)).toBeNull();
  });
});

describe("requester_not_approver", () => {
  it("flags a requester who also approved, naming the approver column", () => {
    const data = dataset([
      tx({ requester_id: "E-0003", approver_1_id: "E-0002", approver_2_id: "E-0003" }),
      tx({ requester_id: "E-0003", approver_1_id: "E-0002", approver_2_id: "" }),
      tx({ requester_id: "E-0003", approver_1_id: "", approver_2_id: "" }),
    ]);
    const results = evaluations(data, check(data, "requester_not_approver", []));
    expect(results.map((result) => result.outcome)).toEqual([
      "flagged",
      "passed",
      "could_not_check",
    ]);
    expect(results[0]?.evidence).toEqual([
      { field: "requester_id", value: "E-0003", condition: "== approver_2_id" },
      { field: "approver_2_id", value: "E-0003", condition: "== requester_id" },
    ]);
  });
});

describe("subject_not_approver", () => {
  it("flags an employee who approved their own transaction", () => {
    const data = dataset([
      tx({ employee_id: "E-0004", approver_1_id: "E-0004" }),
      tx({ employee_id: "E-0004", approver_1_id: "E-0002" }),
    ]);
    const results = evaluations(data, check(data, "subject_not_approver", []));
    expect(results.map((result) => result.outcome)).toEqual(["flagged", "passed"]);
  });
});

describe("person IDs written as numbers", () => {
  it("still matches a requester who approved their own request", () => {
    const digits = TRANSACTION_COLUMNS.map((column) =>
      ["employee_id", "requester_id", "approver_ids"].includes(column.role ?? "")
        ? { ...column, type: "integer" as const }
        : column,
    );
    const data = dataset(
      [tx({ employee_id: "0004", requester_id: "0031", approver_1_id: "0031", approver_2_id: "" })],
      { columns: digits },
    );
    expect(evaluations(data, check(data, "requester_not_approver", []))[0]?.outcome).toBe(
      "flagged",
    );
  });
});

describe("approver_is_manager", () => {
  const parameters = (approver: string, reach: string) => [
    param("approver", "string", approver),
    param("reach", "string", reach),
  ];

  // E-0004's reporting line is E-0003, E-0002, E-0001.
  it("flags a first approver outside the employee's reporting line", () => {
    const data = dataset([
      tx({ approver_1_id: "E-0002" }),
      tx({ approver_1_id: "E-0006", approver_2_id: "E-0003" }),
      tx({ approver_1_id: "E-9001" }),
      tx({ approver_1_id: "", approver_2_id: "" }),
      tx({ employee_id: "E-0099" }),
    ]);
    const built = check(data, "approver_is_manager", parameters("first", "reporting_line"));
    expect(built.logic).toEqual({
      "!": { in_manager_chain: [{ var: "employee_id" }, { var: "approvers[0]" }] },
    });
    const results = evaluations(data, built);
    expect(results.map((result) => result.outcome)).toEqual([
      "passed",
      "flagged",
      "could_not_check",
      "could_not_check",
      "could_not_check",
    ]);
    expect(results[1]?.evidence).toEqual([
      { field: "employee_id", value: "E-0004", condition: "" },
      { field: "approver_1_id", value: "E-0006", condition: "not in reporting_line" },
      { field: "reporting_line", value: ["E-0003", "E-0002", "E-0001"], condition: "" },
    ]);
    expect(results[2]?.missing).toEqual([
      { field: "approvers[0]", reason: "not_found", value: "E-9001" },
    ]);
    expect(results[4]?.missing).toEqual([
      { field: "employee_id", reason: "not_found", value: "E-0099" },
    ]);
  });

  it("can require the line manager themselves", () => {
    const data = dataset([tx({ approver_1_id: "E-0003" }), tx({ approver_1_id: "E-0002" })]);
    const built = check(data, "approver_is_manager", parameters("first", "line_manager"));
    const results = evaluations(data, built);
    expect(results.map((result) => result.outcome)).toEqual(["passed", "flagged"]);
    expect(results[1]?.evidence).toEqual([
      { field: "employee_id", value: "E-0004", condition: "" },
      { field: "approver_1_id", value: "E-0002", condition: "not line_manager" },
      { field: "line_manager", value: ["E-0003"], condition: "" },
    ]);
  });

  it("can accept any approver in the reporting line", () => {
    const data = dataset([
      tx({ approver_1_id: "E-0006", approver_2_id: "E-0002" }),
      tx({ approver_1_id: "E-0006", approver_2_id: "E-0007" }),
      tx({ approver_1_id: "E-0006", approver_2_id: "E-9001" }),
    ]);
    const built = check(data, "approver_is_manager", parameters("any", "reporting_line"));
    expect(built.logic).toEqual({
      none: [
        { var: "approvers[].employee_id" },
        { in_manager_chain: [{ var: "employee_id" }, { var: "" }] },
      ],
    });
    const results = evaluations(data, built);
    expect(results.map((result) => result.outcome)).toEqual([
      "passed",
      "flagged",
      "could_not_check",
    ]);
    expect(results[1]?.evidence[1]).toEqual({
      field: "approvers[]",
      value: ["E-0006", "E-0007"],
      condition: "none in reporting_line",
    });
    expect(results[2]?.missing).toEqual([
      { field: "approver_2_id", reason: "not_found", value: "E-9001" },
    ]);
  });
});

describe("subject_not_approver with requests", () => {
  const parameters = [param("not_requester", "string[]", ["allowance_change", "pay_change"])];

  it("flags an employee who requested their own transaction, except for the allowed types", () => {
    const data = dataset([
      tx({ requester_id: "E-0004" }),
      tx({ type: "overtime", requester_id: "E-0004" }),
      tx({ approver_2_id: "E-0004" }),
      tx(),
    ]);
    const built = check(data, "subject_not_approver", parameters);
    expect(built.logic).toEqual({
      or: [
        { some: [{ var: "approvers[]" }, { same_person: [{ var: "" }, { var: "employee_id" }] }] },
        {
          and: [
            { in: [{ var: "type" }, { param: "not_requester" }] },
            { same_person: [{ var: "requester_id" }, { var: "employee_id" }] },
          ],
        },
      ],
    });
    const results = evaluations(data, built);
    expect(results.map((result) => result.outcome)).toEqual([
      "flagged",
      "passed",
      "flagged",
      "passed",
    ]);
    expect(results[0]?.evidence).toEqual([
      { field: "employee_id", value: "E-0004", condition: "== requester_id" },
      { field: "requester_id", value: "E-0004", condition: "== employee_id" },
      { field: "type", value: "allowance_change", condition: "in not_requester" },
    ]);
    expect(results[2]?.evidence).toEqual([
      { field: "employee_id", value: "E-0004", condition: "== approver_2_id" },
      { field: "approver_2_id", value: "E-0004", condition: "== employee_id" },
    ]);
  });

  it("checks approvals only when no request types are set", () => {
    const data = dataset([tx({ requester_id: "E-0004" })]);
    const built = check(data, "subject_not_approver", []);
    expect(built.logic).toEqual({
      some: [{ var: "approvers[]" }, { same_person: [{ var: "" }, { var: "employee_id" }] }],
    });
    expect(evaluations(data, built).map((result) => result.outcome)).toEqual(["passed"]);
  });
});
