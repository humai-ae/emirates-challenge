import { describe, expect, it } from "vitest";
import { InvalidCheckError } from "./evaluate.js";
import { previewCheck } from "./preview.js";
import { check, param } from "./testing/checks.js";
import { dataset, tx } from "./testing/dataset.js";

const parameters = [
  param("types", "string[]", ["allowance_change"]),
  param("amount_limit", "number", 10000),
  param("min_approver_grade", "integer", 10),
];

describe("previewCheck", () => {
  it("counts outcomes and shows up to five flagged rows and three near misses", () => {
    const rows = [
      ...Array.from({ length: 7 }, (_, index) =>
        tx({ transaction_id: `TX-F${index + 1}`, amount: "16200", approver_1_id: "E-0007" }),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        tx({ transaction_id: `TX-N${index + 1}`, amount: "9600", approver_1_id: "E-0007" }),
      ),
      ...Array.from({ length: 30 }, (_, index) =>
        tx({ transaction_id: `TX-P${index + 1}`, amount: "3000" }),
      ),
      tx({ transaction_id: "TX-C1", amount: "16200", approver_1_id: "E-9003" }),
      tx({ transaction_id: "TX-X1", type: "exit" }),
    ];
    const data = dataset(rows);
    const result = previewCheck(data, check(data, "approver_min_grade", parameters));
    expect(result.counts).toEqual({
      not_applicable: 1,
      passed: 34,
      flagged: 7,
      could_not_check: 1,
      needs_judgment: 0,
    });
    expect(result.total).toBe(43);
    expect(result.applicable).toBe(42);
    expect(result.flagged.map((row) => row.transactionId)).toEqual([
      "TX-F1",
      "TX-F2",
      "TX-F3",
      "TX-F4",
      "TX-F5",
    ]);
    expect(result.flagged[0]?.evidence[0]).toEqual({
      field: "amount",
      value: "16200",
      condition: "> 10000",
    });
    expect(result.nearMisses.map((row) => [row.transactionId, row.reason])).toEqual([
      ["TX-N1", "amount_just_under_limit"],
      ["TX-N2", "amount_just_under_limit"],
      ["TX-N3", "amount_just_under_limit"],
    ]);
    expect(result.missing).toEqual([{ field: "approver_1_id", reason: "not_found", count: 1 }]);
    expect(result.warnings).toEqual([]);
  });

  it("warns when a check flags nothing, flags too much, or applies to nothing", () => {
    const none = dataset([tx({ amount: "3000" })]);
    expect(previewCheck(none, check(none, "approver_min_grade", parameters)).warnings).toEqual([
      "flags_none",
    ]);
    const many = dataset([
      tx({ amount: "16200", approver_1_id: "E-0007" }),
      tx({ amount: "3000" }),
    ]);
    expect(previewCheck(many, check(many, "approver_min_grade", parameters)).warnings).toEqual([
      "flags_many",
    ]);
    const nothing = dataset([tx({ type: "exit" })]);
    expect(
      previewCheck(nothing, check(nothing, "approver_min_grade", parameters)).warnings,
    ).toEqual(["applies_to_none"]);
  });

  it("groups the reasons transactions could not be checked", () => {
    const data = dataset([
      tx({ amount: "", approver_1_id: "E-0007" }),
      tx({ amount: "", approver_1_id: "E-0007" }),
      tx({ amount: "16200", approver_1_id: "", approver_2_id: "" }),
    ]);
    expect(previewCheck(data, check(data, "approver_min_grade", parameters)).missing).toEqual([
      { field: "amount", reason: "blank", count: 2 },
      { field: "approver_1_id", reason: "blank", count: 1 },
      { field: "approver_2_id", reason: "blank", count: 1 },
    ]);
  });

  it("refuses a check that can't run", () => {
    const data = dataset([tx()]);
    expect(() => previewCheck(data, { checkKind: "structured" })).toThrow(InvalidCheckError);
  });
});
