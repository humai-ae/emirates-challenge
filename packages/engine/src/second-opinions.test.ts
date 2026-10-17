import { describe, expect, it } from "vitest";
import { prepareCheck } from "./evaluate.js";
import { disagreement, secondOpinionInput } from "./second-opinions.js";
import { check, param } from "./testing/checks.js";
import { dataset, tx } from "./testing/dataset.js";

describe("what Jev reads for a second opinion", () => {
  it("gives Jev the fields each applicable rule names, once each", () => {
    const data = dataset([tx({ amount: "16200", approver_1_id: "E-0007", approver_2_id: "" })]);
    const grade = prepareCheck(
      check(data, "approver_min_grade", [
        param("types", "string[]", ["allowance_change"]),
        param("amount_limit", "number", 10000),
        param("min_approver_grade", "integer", 10),
      ]),
      data,
    );
    const over = prepareCheck(
      check(data, "field_compare", [
        param("types", "string[]", ["allowance_change"]),
        param("field", "column", "amount"),
        param("operator", "string", ">"),
        param("value", "number", 15000),
      ]),
      data,
    );
    const input = secondOpinionInput(data, [grade, over], 0);
    expect(input.fields).toEqual([
      { name: "amount", value: "16200" },
      { name: "approvers[].grade", value: ["8"] },
    ]);
  });

  it("computes the day gaps between a transaction's dates", () => {
    // Took effect on 1 March, submitted on 20 February, approved on 25 February.
    const data = dataset([tx()]);
    const input = secondOpinionInput(data, [], 0);
    expect(input.gaps).toEqual([
      { name: "submitted_after_effective", days: -9 },
      { name: "approved_after_effective", days: -4 },
      { name: "approved_after_submitted", days: 5 },
    ]);
    // Without a submitted date, only the gap that doesn't need it.
    const unsubmitted = dataset([tx({ submitted_at: "" })]);
    expect(secondOpinionInput(unsubmitted, [], 0).gaps).toEqual([
      { name: "approved_after_effective", days: -4 },
    ]);
  });
});

describe("a disagreement with the check", () => {
  it("keeps only strong disagreements with enough information", () => {
    // The check flagged it; Jev is sure it doesn't break the rule.
    expect(disagreement("flagged", 0.1, 0.9)).toEqual({ strength: 0.9 });
    expect(disagreement("flagged", 0.3, 0.9)).toBeNull();
    // The check passed it; Jev is sure it breaks the rule.
    expect(disagreement("passed", 0.92, 0.9)).toEqual({ strength: 0.92 });
    expect(disagreement("passed", 0.8, 0.9)).toBeNull();
    // Not enough to judge: no disagreement, however sure.
    expect(disagreement("passed", 0.97, 0.4)).toBeNull();
  });
});
