import {
  type AiDraft,
  buildCheck,
  draftByKeywords,
  extractCandidates,
  type PreparedDataset,
  presetParameters,
  restate,
  type Vocabulary,
} from "@hrcc/engine";
import {
  type Check,
  type DraftError,
  type NeededField,
  type Parameter,
  type ParameterIssue,
  type ParameterValue,
  PRESET_CATALOGUE,
  type PresetId,
  type RuleStatus,
} from "@hrcc/shared";

/** A check type and values that fit it, built against a dataset. */
export interface BuiltDraft {
  /** `needs_data`: the dataset has no column for a role the check needs. */
  status: "draft" | "needs_data";
  preset: PresetId;
  /** Every parameter of the check type, set or not. */
  parameters: Parameter[];
  check: Check | null;
  needs: NeededField[];
  restatementEn: string;
  restatementAr: string;
}

/** The drafted part of an open rule version. */
export interface DraftFields {
  status: Extract<RuleStatus, "drafting" | "draft" | "needs_data" | "draft_failed">;
  preset: PresetId | null;
  parameters: Parameter[];
  check: Check | null;
  needs: NeededField[];
  restatementEn: string | null;
  restatementAr: string | null;
  draftError: DraftError | null;
}

export function valuesOf(parameters: readonly Parameter[]): Record<string, ParameterValue> {
  return Object.fromEntries(parameters.map((parameter) => [parameter.name, parameter.value]));
}

function complete(preset: PresetId, given: readonly Parameter[]): Parameter[] {
  return PRESET_CATALOGUE[preset].parameters.map(
    (spec): Parameter =>
      given.find((parameter) => parameter.name === spec.name) ?? {
        name: spec.name,
        type: spec.type,
        value: null,
        editedByAdmin: false,
      },
  );
}

/**
 * The check for a check type and its values on this dataset. Values that don't fit the check type
 * come back as issues; a role the dataset has no column for makes the draft `needs_data`, which
 * can't be approved until the data has it.
 */
export function buildDraft(
  preset: PresetId,
  values: Readonly<Record<string, ParameterValue>>,
  dataset: PreparedDataset,
): BuiltDraft | { issues: ParameterIssue[] } {
  const given = presetParameters(preset, values);
  const result = buildCheck(preset, given, dataset);
  if (!result.ok && result.reason === "parameters") return { issues: result.issues };
  if (!result.ok && result.reason === "unknown_preset") {
    throw new Error(`The engine has no check type ${preset}`);
  }
  const parameters = result.ok ? result.check.parameters : complete(preset, given);
  const texts = {
    restatementEn: restate(preset, valuesOf(parameters), "en"),
    restatementAr: restate(preset, valuesOf(parameters), "ar"),
  };
  if (!result.ok) {
    return { status: "needs_data", preset, parameters, check: null, needs: result.needs, ...texts };
  }
  return { status: "draft", preset, parameters, check: result.check, needs: [], ...texts };
}

const FAILED: DraftFields = {
  status: "draft_failed",
  preset: null,
  parameters: [],
  check: null,
  needs: [],
  restatementEn: null,
  restatementAr: null,
  draftError: "no_match",
};

/** A failed draft: no check type fits the rule, so the admin chooses one. */
export function failedDraft(): DraftFields {
  return { ...FAILED };
}

/** A version waiting for its background draft. */
export const WAITING: DraftFields = {
  status: "drafting",
  preset: null,
  parameters: [],
  check: null,
  needs: [],
  restatementEn: null,
  restatementAr: null,
  draftError: null,
};

/**
 * AI's draft built on this dataset. When a value the check type needs isn't in the rule's words,
 * the draft is `incomplete`: the check type and the values found stay for the admin to finish.
 */
export function draftFromAi(draft: AiDraft, dataset: PreparedDataset): DraftFields {
  const built = buildDraft(draft.preset, draft.values, dataset);
  if ("issues" in built) {
    return {
      status: "draft_failed",
      preset: draft.preset,
      parameters: complete(draft.preset, presetParameters(draft.preset, draft.values)),
      check: null,
      needs: [],
      restatementEn: null,
      restatementAr: null,
      draftError: "incomplete",
    };
  }
  return { ...built, draftError: null };
}

/**
 * A first draft from the rule's own words, without AI. When the words point to no check type, or
 * to values that don't fit it, the draft fails visibly and the admin picks the check type.
 */
export function draftFromText(
  text: string,
  dataset: PreparedDataset,
  vocabulary: Vocabulary,
): DraftFields {
  const proposal = draftByKeywords(text, extractCandidates(text, vocabulary), dataset, vocabulary);
  if (!proposal) return { ...FAILED };
  const built = buildDraft(proposal.preset, proposal.values, dataset);
  if ("issues" in built) return { ...FAILED };
  return { ...built, draftError: null };
}
