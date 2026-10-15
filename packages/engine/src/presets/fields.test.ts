import { describe, expect, it } from "vitest";
import { check, evaluations, nearMiss, param } from "../testing/checks.js";
import { dataset, tx } from "../testing/dataset.js";
import { buildCheck } from "./index.js";

describe("required_field", () => {
  const parameters = [
    param("types", "string[]", ["pay_change"]),
    param("field", "column", "justification"),
    param("amount_over", "number", 5000),
  ];

  it("flags a blank justification above the amount", () => {
    const data = dataset([
      tx({ type: "pay_change", amount: "7000", justification: "" }),
      tx({ type: "pay_change", amount: "7000", justification: "Annual review" }),
      tx({ type: "pay_change", amount: "5000", justification: "" }),
      tx({ type: "allowance_change", amount: "7000", justification: "" }),
    ]);
    const results = evaluations(data, check(data, "required_field", parameters));
    expect(results.map((result) => result.outcome)).toEqual([
      "flagged",
      "passed",
      "passed",
      "not_applicable",
    ]);
    expect(results[0]?.evidence).toEqual([
      { field: "amount", value: "7000", condition: "> 5000" },
      { field: "justification", value: "", condition: "is blank" },
    ]);
  });

  it("can't check a blank amount when the justification is blank too", () => {
    const data = dataset([
      tx({ type: "pay_change", amount: "", justification: "" }),
      tx({ type: "pay_change", amount: "", justification: "Annual review" }),
    ]);
    const results = evaluations(data, check(data, "required_field", parameters));
    expect(results[0]).toMatchObject({
      outcome: "could_not_check",
      missing: [{ field: "amount", reason: "blank" }],
    });
    expect(results[1]?.outcome).toBe("passed");
  });

  it("needs the field on every transaction when no amount is given", () => {
    const data = dataset([tx({ justification: "" })]);
    const built = check(data, "required_field", [param("field", "column", "justification")]);
    expect(built.appliesTo).toBe(true);
    expect(built.logic).toEqual({ is_blank: { var: "justification" } });
    expect(evaluations(data, built)[0]?.outcome).toBe("flagged");
  });

  it("points out an amount just under the threshold", () => {
    const data = dataset([tx({ type: "pay_change", amount: "4800", justification: "" })]);
    expect(nearMiss(data, check(data, "required_field", parameters), 0)).toEqual({
      reason: "amount_just_under_threshold",
      facts: [
        { field: "amount", value: "4800", condition: "<= 5000" },
        { field: "justification", value: "", condition: "is blank" },
      ],
    });
  });
});

describe("field_compare", () => {
  const parameters = [
    param("types", "string[]", ["overtime"]),
    param("field", "column", "amount"),
    param("operator", "string", ">"),
    param("value", "number", 5000),
  ];

  it("flags a number over the limit", () => {
    const data = dataset([
      tx({ type: "overtime", amount: "5200" }),
      tx({ type: "overtime", amount: "4600" }),
      tx({ type: "overtime", amount: "AED 5k" }),
    ]);
    const built = check(data, "field_compare", parameters);
    expect(built.logic).toEqual({ ">": [{ var: "amount" }, { param: "value" }] });
    const results = evaluations(data, built);
    expect(results.map((result) => result.outcome)).toEqual([
      "flagged",
      "passed",
      "could_not_check",
    ]);
    expect(results[0]?.evidence).toEqual([{ field: "amount", value: "5200", condition: "> 5000" }]);
    expect(results[2]?.missing).toEqual([{ field: "amount", reason: "invalid" }]);
    expect(nearMiss(data, built, 1)?.reason).toBe("value_just_under_limit");
  });

  it("compares numbers only", () => {
    const data = dataset([tx()]);
    const result = buildCheck(
      "field_compare",
      [
        param("field", "column", "justification"),
        param("operator", "string", ">"),
        param("value", "number", 1),
      ],
      data,
    );
    expect(result).toEqual({
      ok: false,
      reason: "parameters",
      issues: [{ parameter: "field", problem: "column_type" }],
    });
  });
});
