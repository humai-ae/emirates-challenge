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
    values: { types: ["exit"], documents: ["resignation_letter", "clearance_form"] },
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
