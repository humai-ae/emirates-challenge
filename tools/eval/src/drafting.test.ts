import {
  buildCheck,
  datasetVocabulary,
  draftByKeywords,
  extractCandidates,
  type PreparedDataset,
  presetParameters,
  type RuleInput,
  splitPolicy,
} from "@hrcc/engine";
import { generatePack } from "@hrcc/sample-data";
import { type ParameterValue, PRESET_CATALOGUE, type PresetId } from "@hrcc/shared";
import { describe, expect, it } from "vitest";
import { evaluatePack, preparePack } from "./evaluate-pack.ts";
import { SAMPLE_RULES } from "./sample-rules.ts";
import { belowGate, scoreFindings } from "./score.ts";

const encoder = new TextEncoder();

/** Every parameter of the check type, unset ones as null. */
function complete(preset: PresetId, values: Readonly<Record<string, ParameterValue>>) {
  return Object.fromEntries(
    PRESET_CATALOGUE[preset].parameters.map((spec) => [spec.name, values[spec.name] ?? null]),
  );
}

describe("drafting the synthetic policy without AI", () => {
  it("drafts the generated policy into checks that find every planted break", () => {
    const pack = generatePack({ seed: 7, employees: 60, transactions: 300 });
    const files = {
      transactions: encoder.encode(pack.files["transactions.csv"]),
      employees: encoder.encode(pack.files["employees.csv"]),
    };
    const dataset = preparePack(files);
    const vocabulary = datasetVocabulary(dataset);
    const drafts = new Map(
      splitPolicy(pack.files["policy_rules.md"]).rules.map((rule) => [
        rule.id,
        draftByKeywords(rule.text, extractCandidates(rule.text, vocabulary), dataset, vocabulary),
      ]),
    );
    expect(drafts.get("R-07")?.preset).toBe("text_judgment");
    for (const rule of SAMPLE_RULES) {
      const draft = drafts.get(rule.ruleId);
      expect(draft?.preset, rule.ruleId).toBe(rule.preset);
      if (draft) {
        expect(complete(draft.preset, draft.values), rule.ruleId).toEqual(
          complete(rule.preset, rule.values),
        );
      }
    }
    const drafted = (prepared: PreparedDataset): RuleInput[] =>
      SAMPLE_RULES.map((rule) => {
        const draft = drafts.get(rule.ruleId);
        if (!draft) throw new Error(`${rule.ruleId} wasn't drafted`);
        const result = buildCheck(
          draft.preset,
          presetParameters(draft.preset, draft.values),
          prepared,
        );
        if (!result.ok) throw new Error(`${rule.ruleId} can't be built: ${JSON.stringify(result)}`);
        return { ruleId: rule.ruleId, version: 1, check: result.check };
      });
    const score = scoreFindings(evaluatePack(files, drafted).findings, pack.answerKey);
    expect(belowGate(score)).toEqual([]);
    expect(score.overall.precision).toBe(1);
    expect(score.overall.recall).toBe(1);
  });
});
