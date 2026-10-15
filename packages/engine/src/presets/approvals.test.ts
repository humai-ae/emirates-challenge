import { describe, expect, it } from "vitest";
import { check, evaluations, nearMiss, param } from "../testing/checks.js";
import { dataset, tx } from "../testing/dataset.js";

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
