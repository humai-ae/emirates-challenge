import { describe, expect, it } from "vitest";
import { check, evaluations, nearMiss, param } from "../testing/checks.js";
import { dataset, tx } from "../testing/dataset.js";

describe("max_count_in_window", () => {
  const parameters = [
    param("types", "string[]", ["allowance_change"]),
    param("max_count", "integer", 2),
    param("window_days", "integer", 365),
    param("per", "string", "employee"),
  ];

  it("flags the third allowance change within a year, listing all three", () => {
    const data = dataset([
      tx({ transaction_id: "TX-1", effective_date: "2025-01-10" }),
      tx({ transaction_id: "TX-2", effective_date: "2025-05-10" }),
      tx({ transaction_id: "TX-3", effective_date: "2025-09-10" }),
      // 365 days after TX-1, which is now outside the window: TX-2, TX-3 and TX-4 remain.
      tx({ transaction_id: "TX-4", effective_date: "2026-01-10" }),
      tx({ transaction_id: "TX-5", effective_date: "2025-06-01", type: "pay_change" }),
      tx({ transaction_id: "TX-6", effective_date: "2025-06-01", employee_id: "E-0006" }),
    ]);
    const results = evaluations(data, check(data, "max_count_in_window", parameters));
    expect(results.map((result) => result.outcome)).toEqual([
      "passed",
      "passed",
      "flagged",
      "flagged",
      "not_applicable",
      "passed",
    ]);
    expect(results[2]?.evidence).toEqual([
      { field: "employee_id", value: "E-0004", condition: "" },
      { field: "count_in_window", value: "3", condition: "> 2" },
      {
        field: "transactions_in_window",
        value: ["TX-1", "TX-2", "TX-3"],
        condition: "within 365 days",
      },
    ]);
  });

  it("can count per requester", () => {
    const data = dataset([
      tx({ employee_id: "E-0004", requester_id: "E-0003", effective_date: "2025-01-10" }),
      tx({ employee_id: "E-0006", requester_id: "E-0003", effective_date: "2025-02-10" }),
    ]);
    const perRequester = [
      param("types", "string[]", ["allowance_change"]),
      param("max_count", "integer", 1),
      param("window_days", "integer", 90),
      param("per", "string", "requester"),
    ];
    const results = evaluations(data, check(data, "max_count_in_window", perRequester));
    expect(results.map((result) => result.outcome)).toEqual(["passed", "flagged"]);
  });

  it("can't count without the effective date, and points out a count at the limit", () => {
    const data = dataset([
      tx({ transaction_id: "TX-1", effective_date: "2025-01-10" }),
      tx({ transaction_id: "TX-2", effective_date: "2025-03-10" }),
      tx({ transaction_id: "TX-3", effective_date: "" }),
    ]);
    const built = check(data, "max_count_in_window", parameters);
    expect(evaluations(data, built)[2]).toMatchObject({
      outcome: "could_not_check",
      missing: [{ field: "effective_date", reason: "blank" }],
    });
    expect(nearMiss(data, built, 1)).toEqual({
      reason: "count_at_limit",
      facts: [{ field: "count_in_window", value: "2", condition: "== 2" }],
    });
  });
});
