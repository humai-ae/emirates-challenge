import {
  buildCheck,
  type PreparedDataset,
  presetParameters,
  type RuleInput,
  runChecks,
} from "@hrcc/engine";
import { generatePack } from "@hrcc/sample-data";
import type { ParameterValue, PresetId } from "@hrcc/shared";
import { describe, expect, it } from "vitest";
import { preparePack } from "./evaluate-pack.ts";
import { sampleRules } from "./sample-rules.ts";

/** Thirteen more checks besides the sample policy's seven, so the run has twenty. */
const VARIANTS: ReadonlyArray<readonly [PresetId, Record<string, ParameterValue>]> = [
  ["approver_min_grade", { types: ["pay_change"], amount_limit: 20000, min_approver_grade: 12 }],
  ["approver_min_grade", { types: ["overtime"], amount_limit: 4000, min_approver_grade: 8 }],
  ["subject_not_approver", {}],
  [
    "documents_present",
    { types: ["promotion"], documents: ["promotion_form", "performance_review"] },
  ],
  ["documents_present", { types: ["transfer"], documents: ["transfer_form"] }],
  ["approved_by_effective", { types: ["allowance_change"], grace_days: 3 }],
  [
    "max_count_in_window",
    { types: ["pay_change"], max_count: 1, window_days: 180, per: "employee" },
  ],
  ["max_count_in_window", { types: ["overtime"], max_count: 3, window_days: 90, per: "requester" }],
  ["required_field", { types: ["allowance_change"], field: "justification", amount_over: 10000 }],
  ["field_compare", { types: ["overtime"], field: "amount", operator: ">", value: 4500 }],
  ["field_compare", { types: ["allowance_change"], field: "amount", operator: ">=", value: 19000 }],
  ["submitted_within_after_effective", { types: ["exit"], max_days: 7 }],
  ["requester_not_approver", { types: ["pay_change"] }],
];

function twentyRules(dataset: PreparedDataset): RuleInput[] {
  const variants = VARIANTS.map(([preset, values], index) => {
    const result = buildCheck(preset, presetParameters(preset, values), dataset);
    if (!result.ok)
      throw new Error(`Variant ${index + 1} can't be built: ${JSON.stringify(result)}`);
    return { ruleId: `V-${String(index + 1).padStart(2, "0")}`, version: 1, check: result.check };
  });
  return [...sampleRules(dataset), ...variants];
}

describe("speed", () => {
  it("checks 10,000 transactions against 20 rules in under a minute", { timeout: 180_000 }, () => {
    const pack = generatePack({ seed: 2025, employees: 2000, transactions: 10000 });
    const encoder = new TextEncoder();
    const dataset = preparePack({
      transactions: encoder.encode(pack.files["transactions.csv"]),
      employees: encoder.encode(pack.files["employees.csv"]),
    });
    const rules = twentyRules(dataset);
    expect(rules).toHaveLength(20);
    const started = performance.now();
    const runs = runChecks(dataset, rules);
    const seconds = (performance.now() - started) / 1000;
    console.log(`10,000 transactions × 20 rules: ${seconds.toFixed(2)} s`);
    for (const run of runs) {
      expect(Object.values(run.counts).reduce((sum, count) => sum + count, 0)).toBe(10000);
    }
    expect(seconds).toBeLessThan(60);
  });
});
