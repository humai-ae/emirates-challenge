import { buildCheck, type PreparedDataset, presetParameters, type RuleInput } from "@hrcc/engine";
import type { ParameterValue, PresetId } from "@hrcc/shared";

interface SampleRule {
  ruleId: string;
  preset: PresetId;
  values: Record<string, ParameterValue>;
}

/**
 * The synthetic policy (tools/sample-data) as an admin would approve it. R-07 is left out: it is a
 * judgment rule, so AI reads the justifications and the answer key has no labels for it.
 */
export const SAMPLE_RULES: readonly SampleRule[] = [
  {
    ruleId: "R-01",
    preset: "approver_min_grade",
    values: { types: ["allowance_change"], amount_limit: 10000, min_approver_grade: 10 },
  },
  { ruleId: "R-02", preset: "requester_not_approver", values: {} },
  {
    ruleId: "R-03",
    preset: "documents_present",
    values: {
      types: ["exit"],
      documents: ["clearance_form"],
      any_of: ["resignation_letter", "termination_letter"],
    },
  },
  {
    ruleId: "R-04",
    preset: "approved_by_effective",
    values: { types: ["pay_change"], grace_days: 0 },
  },
  {
    ruleId: "R-05",
    preset: "max_count_in_window",
    values: { types: ["allowance_change"], max_count: 2, window_days: 365, per: "employee" },
  },
  {
    ruleId: "R-06",
    preset: "required_field",
    values: { types: ["pay_change"], field: "justification", amount_over: 5000 },
  },
  { ruleId: "R-08", preset: "submitted_within_after_effective", values: { max_days: 30 } },
  {
    ruleId: "R-09",
    preset: "approver_is_manager",
    values: { approver: "first", reach: "reporting_line" },
  },
  { ruleId: "R-10", preset: "approvals_in_order", values: {} },
  {
    ruleId: "R-11",
    preset: "duplicate_transaction",
    values: { types: ["pay_change"], window_days: 7, same_amount: "yes" },
  },
  { ruleId: "R-12", preset: "tenure_minimum", values: { types: ["pay_change"], min_days: 180 } },
  {
    ruleId: "R-13",
    preset: "subject_not_approver",
    values: { not_requester: ["allowance_change", "exit", "pay_change", "promotion", "transfer"] },
  },
];

/** The synthetic policy's checks, built for this dataset's columns. */
export function sampleRules(dataset: PreparedDataset): RuleInput[] {
  return SAMPLE_RULES.map((rule) => {
    const result = buildCheck(rule.preset, presetParameters(rule.preset, rule.values), dataset);
    if (!result.ok) {
      throw new Error(`${rule.ruleId} can't be built for this dataset: ${JSON.stringify(result)}`);
    }
    return { ruleId: rule.ruleId, version: 1, check: result.check };
  });
}
