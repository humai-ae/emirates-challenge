import { describe, expect, it } from "vitest";
import { check, evaluations, nearMiss, param } from "../testing/checks.js";
import { APPROVER_TIME_COLUMNS, dataset, tx } from "../testing/dataset.js";
import { buildCheck } from "./index.js";

describe("approved_by_effective", () => {
  const parameters = [
    param("types", "string[]", ["pay_change"]),
    param("grace_days", "integer", 0),
  ];

  it("flags approval after the effective date, by calendar day in Dubai", () => {
    const data = dataset([
      tx({ type: "pay_change", effective_date: "2025-02-20", approved_at: "2025-02-27 11:00" }),
      tx({ type: "pay_change", effective_date: "2025-02-20", approved_at: "2025-02-20 23:30" }),
      tx({ type: "pay_change", effective_date: "2025-02-20", approved_at: "2025-02-19 09:00" }),
      tx({ type: "pay_change", effective_date: "2025-02-20", approved_at: "" }),
    ]);
    const built = check(data, "approved_by_effective", parameters);
    const results = evaluations(data, built);
    expect(results.map((result) => result.outcome)).toEqual([
      "flagged",
      "passed",
      "passed",
      "could_not_check",
    ]);
    expect(results[0]?.evidence).toEqual([
      { field: "approved_at", value: "2025-02-27 11:00", condition: "> effective_date + 0 days" },
      { field: "effective_date", value: "2025-02-20", condition: "" },
      { field: "days_after_effective", value: "7", condition: "> 0" },
    ]);
    expect(nearMiss(data, built, 1)).toEqual({
      reason: "approved_on_deadline",
      facts: [{ field: "days_after_effective", value: "0", condition: "== 0" }],
    });
    expect(results[3]?.missing).toEqual([{ field: "approved_at", reason: "blank" }]);
  });

  it("allows grace days", () => {
    const data = dataset([
      tx({ type: "pay_change", effective_date: "2025-02-20", approved_at: "2025-02-23 10:00" }),
      tx({ type: "pay_change", effective_date: "2025-02-20", approved_at: "2025-02-24 10:00" }),
    ]);
    const graceful = [
      param("types", "string[]", ["pay_change"]),
      param("grace_days", "integer", 3),
    ];
    const results = evaluations(data, check(data, "approved_by_effective", graceful));
    expect(results.map((result) => result.outcome)).toEqual(["passed", "flagged"]);
  });
});

describe("submitted_within_after_effective", () => {
  it("flags late submissions and points out one on the deadline", () => {
    const data = dataset([
      tx({ effective_date: "2025-01-01", submitted_at: "2025-02-01 09:00" }),
      tx({ effective_date: "2025-01-01", submitted_at: "2025-01-31 09:00" }),
      tx({ effective_date: "2025-01-01", submitted_at: "2024-12-20 09:00" }),
    ]);
    const built = check(data, "submitted_within_after_effective", [
      param("max_days", "integer", 30),
    ]);
    expect(evaluations(data, built).map((result) => result.outcome)).toEqual([
      "flagged",
      "passed",
      "passed",
    ]);
    expect(nearMiss(data, built, 1)?.reason).toBe("submitted_on_deadline");
  });

  it("refuses a negative number of days", () => {
    const data = dataset([tx()]);
    expect(
      buildCheck("submitted_within_after_effective", [param("max_days", "integer", -1)], data),
    ).toEqual({
      ok: false,
      reason: "parameters",
      issues: [{ parameter: "max_days", problem: "too_small" }],
    });
  });
});

describe("approved_by_effective with a time for each approver", () => {
  const parameters = [
    param("types", "string[]", ["pay_change"]),
    param("grace_days", "integer", 0),
  ];
  const row = (values: Record<string, string> = {}) =>
    tx({
      type: "pay_change",
      effective_date: "2025-03-01",
      approver_1_at: "2025-02-25 11:00",
      approver_2_id: "E-0005",
      approver_2_at: "2025-02-27 09:00",
      ...values,
    });

  it("counts the transaction as approved when its last approver approved", () => {
    const data = dataset(
      [
        row(),
        row({ approver_2_at: "2025-03-03 10:00" }),
        row({ approver_2_id: "", approver_2_at: "" }),
        row({ approver_2_at: "" }),
      ],
      { columns: APPROVER_TIME_COLUMNS },
    );
    const built = check(data, "approved_by_effective", parameters);
    expect(built.logic).toEqual({
      ">": [
        { days_between: [{ var: "effective_date" }, { max: { var: "approval_times[]" } }] },
        { param: "grace_days" },
      ],
    });
    const results = evaluations(data, built);
    expect(results.map((result) => result.outcome)).toEqual([
      "passed",
      "flagged",
      "passed",
      "could_not_check",
    ]);
    expect(results[1]?.evidence).toEqual([
      { field: "approver_2_at", value: "2025-03-03 10:00", condition: "> effective_date + 0 days" },
      { field: "effective_date", value: "2025-03-01", condition: "" },
      { field: "days_after_effective", value: "2", condition: "> 0" },
    ]);
    expect(results[3]?.missing).toEqual([{ field: "approver_2_at", reason: "blank" }]);
  });
});

describe("approvals_in_order", () => {
  const row = (values: Record<string, string>) =>
    tx({
      submitted_at: "2025-02-20 09:10",
      approver_1_at: "2025-02-21 10:00",
      approver_2_id: "E-0005",
      approver_2_at: "2025-02-22 15:00",
      ...values,
    });

  it("flags an approval before the request, or before the approval above it", () => {
    const data = dataset(
      [
        row({}),
        row({ approver_1_at: "2025-02-20 08:00" }),
        row({ approver_2_at: "2025-02-21 09:00" }),
        row({ approver_2_id: "", approver_2_at: "" }),
        row({ approver_2_at: "" }),
      ],
      { columns: APPROVER_TIME_COLUMNS },
    );
    const built = check(data, "approvals_in_order", []);
    expect(built.logic).toEqual({
      "!": { in_order: [{ var: "submitted_at" }, { var: "approval_times[]" }] },
    });
    const results = evaluations(data, built);
    expect(results.map((result) => result.outcome)).toEqual([
      "passed",
      "flagged",
      "flagged",
      "passed",
      "could_not_check",
    ]);
    expect(results[1]?.evidence).toEqual([
      { field: "approver_1_at", value: "2025-02-20 08:00", condition: "< submitted_at" },
      { field: "submitted_at", value: "2025-02-20 09:10", condition: "" },
    ]);
    expect(results[2]?.evidence).toEqual([
      { field: "approver_2_at", value: "2025-02-21 09:00", condition: "< approver_1_at" },
      { field: "approver_1_at", value: "2025-02-21 10:00", condition: "" },
    ]);
  });

  it("checks one approval time against the request", () => {
    const data = dataset([tx(), tx({ approved_at: "2025-02-19 16:00" })]);
    const results = evaluations(data, check(data, "approvals_in_order", []));
    expect(results.map((result) => result.outcome)).toEqual(["passed", "flagged"]);
  });
});

describe("tenure_minimum", () => {
  const parameters = [
    param("types", "string[]", ["pay_change"]),
    param("min_days", "integer", 180),
  ];

  it("flags a change that takes effect too soon after the employee's hire date", () => {
    const data = dataset([
      // E-0004 joined on 2024-11-01: 2025-04-30 is day 180.
      tx({ type: "pay_change", effective_date: "2025-04-29" }),
      tx({ type: "pay_change", effective_date: "2025-04-30" }),
      tx({ type: "pay_change", effective_date: "2025-04-29", employee_id: "E-0008" }),
      tx({ type: "pay_change", effective_date: "2025-04-29", employee_id: "E-0099" }),
    ]);
    const built = check(data, "tenure_minimum", parameters);
    expect(built.logic).toEqual({
      "<": [
        { days_between: [{ var: "employee.hire_date" }, { var: "effective_date" }] },
        { param: "min_days" },
      ],
    });
    const results = evaluations(data, built);
    expect(results.map((result) => result.outcome)).toEqual([
      "flagged",
      "passed",
      "could_not_check",
      "could_not_check",
    ]);
    expect(results[0]?.evidence).toEqual([
      { field: "employee.hire_date", value: "2024-11-01", condition: "" },
      { field: "effective_date", value: "2025-04-29", condition: "" },
      { field: "days_since_hire", value: "179", condition: "< 180" },
    ]);
    expect(nearMiss(data, built, 1)).toEqual({
      reason: "days_at_minimum",
      facts: [{ field: "days_since_hire", value: "180", condition: "== 180" }],
    });
    expect(results[2]?.missing).toEqual([{ field: "employee.hire_date", reason: "blank" }]);
    expect(results[3]?.missing).toEqual([
      { field: "employee_id", reason: "not_found", value: "E-0099" },
    ]);
  });
});
