import { describe, expect, it } from "vitest";
import { check, evaluations, nearMiss, param } from "../testing/checks.js";
import { dataset, tx } from "../testing/dataset.js";
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
