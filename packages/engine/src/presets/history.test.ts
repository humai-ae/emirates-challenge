import { describe, expect, it } from "vitest";
import { check, evaluations, nearMiss, param } from "../testing/checks.js";
import { dataset, TRANSACTION_COLUMNS, tx } from "../testing/dataset.js";

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

  it("counts a person whose ID is written as a number", () => {
    const digits = TRANSACTION_COLUMNS.map((column) =>
      ["employee_id", "requester_id", "approver_ids"].includes(column.role ?? "")
        ? { ...column, type: "integer" as const }
        : column,
    );
    const data = dataset(
      [
        tx({ employee_id: "0004", effective_date: "2025-01-10" }),
        tx({ employee_id: "0004", effective_date: "2025-03-10" }),
        tx({ employee_id: "0004", effective_date: "2025-05-10" }),
      ],
      { columns: digits },
    );
    const results = evaluations(data, check(data, "max_count_in_window", parameters));
    expect(results.map((result) => result.outcome)).toEqual(["passed", "passed", "flagged"]);
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

describe("duplicate_transaction", () => {
  const parameters = (sameAmount: "yes" | "no") => [
    param("types", "string[]", ["pay_change"]),
    param("window_days", "integer", 7),
    param("same_amount", "string", sameAmount),
  ];
  const pay = (values: Record<string, string>) =>
    tx({ type: "pay_change", amount: "3000", ...values });
  const rows = [
    pay({ transaction_id: "TX-1", effective_date: "2025-03-01", submitted_at: "2025-02-20 09:00" }),
    pay({ transaction_id: "TX-2", effective_date: "2025-03-06", submitted_at: "2025-02-21 09:00" }),
    pay({ transaction_id: "TX-3", effective_date: "2025-03-20", submitted_at: "2025-02-22 09:00" }),
    pay({
      transaction_id: "TX-4",
      effective_date: "2025-03-02",
      submitted_at: "2025-02-23 09:00",
      amount: "3500",
    }),
    pay({
      transaction_id: "TX-5",
      effective_date: "2025-03-03",
      submitted_at: "2025-02-24 09:00",
      employee_id: "E-0006",
    }),
    tx({
      transaction_id: "TX-6",
      type: "allowance_change",
      amount: "3000",
      effective_date: "2025-03-02",
      submitted_at: "2025-02-25 09:00",
    }),
  ];

  it("flags the later-submitted of two matching transactions within the window", () => {
    const data = dataset(rows);
    const built = check(data, "duplicate_transaction", parameters("yes"));
    expect(built.logic).toEqual({
      ">": [
        {
          history_duplicates: [{ var: "employee_id" }, { param: "window_days" }, { var: "amount" }],
        },
        0,
      ],
    });
    const results = evaluations(data, built);
    expect(results.map((result) => result.outcome)).toEqual([
      "passed",
      "flagged",
      "passed",
      "passed",
      "passed",
      "not_applicable",
    ]);
    expect(results[1]?.evidence).toEqual([
      { field: "employee_id", value: "E-0004", condition: "" },
      { field: "type", value: "pay_change", condition: "" },
      { field: "amount", value: "3000", condition: "same amount" },
      { field: "duplicate_of", value: ["TX-1"], condition: "within 7 days, submitted earlier" },
    ]);
  });

  it("can match whatever the amount", () => {
    const data = dataset(rows);
    const results = evaluations(data, check(data, "duplicate_transaction", parameters("no")));
    expect(results.map((result) => result.outcome)).toEqual([
      "passed",
      "flagged",
      "passed",
      "flagged",
      "passed",
      "not_applicable",
    ]);
    expect(results[3]?.evidence).toEqual([
      { field: "employee_id", value: "E-0004", condition: "" },
      { field: "type", value: "pay_change", condition: "" },
      {
        field: "duplicate_of",
        value: ["TX-1", "TX-2"],
        condition: "within 7 days, submitted earlier",
      },
    ]);
  });

  it("takes the earlier row as the original when both were submitted at the same minute", () => {
    const data = dataset([
      pay({
        transaction_id: "TX-1",
        effective_date: "2025-03-01",
        submitted_at: "2025-02-20 09:00",
      }),
      pay({
        transaction_id: "TX-2",
        effective_date: "2025-03-01",
        submitted_at: "2025-02-20 09:00",
      }),
    ]);
    const results = evaluations(data, check(data, "duplicate_transaction", parameters("yes")));
    expect(results.map((result) => result.outcome)).toEqual(["passed", "flagged"]);
  });

  it("goes by file order when the data has no submitted time", () => {
    const data = dataset(
      [
        pay({ transaction_id: "TX-1", effective_date: "2025-03-04" }),
        pay({ transaction_id: "TX-2", effective_date: "2025-03-01" }),
      ],
      { columns: TRANSACTION_COLUMNS.filter((column) => column.role !== "submitted_at") },
    );
    const results = evaluations(data, check(data, "duplicate_transaction", parameters("yes")));
    expect(results.map((result) => result.outcome)).toEqual(["passed", "flagged"]);
  });

  it("can't decide when a time or an amount it needs can't be read", () => {
    const data = dataset([
      pay({ transaction_id: "TX-1", effective_date: "2025-03-01", submitted_at: "" }),
      pay({
        transaction_id: "TX-2",
        effective_date: "2025-03-03",
        submitted_at: "2025-02-21 09:00",
      }),
      pay({ transaction_id: "TX-3", effective_date: "2025-03-25", amount: "" }),
    ]);
    const results = evaluations(data, check(data, "duplicate_transaction", parameters("yes")));
    expect(results.map((result) => result.outcome)).toEqual([
      "could_not_check",
      "could_not_check",
      "could_not_check",
    ]);
    expect(results[0]?.missing).toEqual([{ field: "submitted_at", reason: "blank" }]);
    expect(results[1]?.missing).toEqual([{ field: "submitted_at", reason: "blank" }]);
    expect(results[2]?.missing).toEqual([{ field: "amount", reason: "blank" }]);
  });
});
