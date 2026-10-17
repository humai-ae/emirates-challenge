import type { Parameter, PresetId } from "@hrcc/shared";
import { describe, expect, it } from "vitest";
import { evaluateRow, prepareCheck } from "./evaluate.js";
import { disagreement, secondOpinionInput } from "./second-opinions.js";
import { check, param } from "./testing/checks.js";
import { dataset, tx } from "./testing/dataset.js";

/**
 * A check of every structured type that the default transaction passes: E-0004's allowance change
 * of 12,000, requested by E-0003 and approved by E-0002, before it took effect.
 */
const PASSING: ReadonlyArray<readonly [PresetId, Parameter[]]> = [
  [
    "field_compare",
    [
      param("field", "column", "amount"),
      param("operator", "string", ">"),
      param("value", "number", 50000),
    ],
  ],
  ["required_field", [param("field", "column", "justification")]],
  [
    "approver_min_grade",
    [param("amount_limit", "number", 10000), param("min_approver_grade", "integer", 10)],
  ],
  [
    "approver_is_manager",
    [param("approver", "string", "any"), param("reach", "string", "reporting_line")],
  ],
  ["requester_not_approver", []],
  ["subject_not_approver", []],
  ["subject_not_approver", [param("not_requester", "string[]", ["allowance_change"])]],
  ["documents_present", [param("documents", "string[]", ["allowance_form"])]],
  ["approved_by_effective", [param("grace_days", "integer", 0)]],
  ["submitted_within_after_effective", [param("max_days", "integer", 30)]],
  ["approvals_in_order", []],
  ["tenure_minimum", [param("min_days", "integer", 30)]],
  [
    "max_count_in_window",
    [
      param("types", "string[]", ["allowance_change"]),
      param("max_count", "integer", 3),
      param("window_days", "integer", 30),
      param("per", "string", "employee"),
    ],
  ],
  [
    "duplicate_transaction",
    [param("window_days", "integer", 7), param("same_amount", "string", "yes")],
  ],
];

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

  it("says only what a passed transaction holds, for every type of check", () => {
    const data = dataset([tx()]);
    const cells = data.rows[0]?.cells ?? {};
    for (const [preset, parameters] of PASSING) {
      const prepared = prepareCheck(check(data, preset, parameters), data);
      expect(evaluateRow(data, prepared, 0).outcome, preset).toBe("passed");
      const { fields } = secondOpinionInput(data, [prepared], 0);
      // Jev always has something to read for each rule it is asked about.
      expect(fields.length, preset).toBeGreaterThan(0);
      for (const field of fields) {
        // A field named after a column holds that column's cell, and the approvers are its own.
        const said = Array.isArray(field.value) ? field.value.join(";") : field.value;
        if (field.name in cells) expect(said, `${preset}: ${field.name}`).toBe(cells[field.name]);
        if (field.name === "approvers[]") expect(field.value, preset).toEqual(["E-0002"]);
      }
    }
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
