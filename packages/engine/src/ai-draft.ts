import {
  type AiDraftDecisions,
  type AiDraftRuleRequest,
  type ColumnType,
  NONE_FITS,
  NUMBER_COLUMN_TYPES,
  type ParameterValue,
  PRESET_IDS,
  type PresetId,
  TEXT_COLUMN_TYPES,
} from "@hrcc/shared";
import { extractCandidates } from "./candidates.js";
import type { Vocabulary } from "./vocabulary.js";

/** A transactions column as the rule screens describe it. */
export interface DraftColumn {
  name: string;
  type: ColumnType;
  role: string | null;
}

/** What a rule's words and the data offer, which decides the check types AI's answers can fill. */
export interface DraftContext {
  candidates: AiDraftRuleRequest["candidates"];
  vocabulary: Vocabulary;
  columns: { number: string[]; text: string[]; any: string[] };
  /** The documents the rule's words join with "or". */
  alternatives: string[];
  /** Types the rule's words name as exceptions. */
  exceptTypes: string[];
}

/** A check type and values from AI's answers, and how sure the least certain answer used was. */
export interface AiDraft {
  preset: PresetId;
  values: Record<string, ParameterValue>;
  confidence: number;
  /** The parameter the least certain answer filled, or "preset" for the check type. */
  weakest: string;
}

/** [what the answer filled, how sure AI was of it]. */
type Answer = [string, number];

const CANDIDATES = 20;
const VOCABULARY = 50;
/** The longest values the AI request carries; longer ones are left out rather than cut. */
const MAX_VALUE = 64;
const MAX_COLUMN = 128;
const MAX_ROLE = 40;
/** Types this close to the likeliest one count as likely too. */
const TIE = 0.05;
/** A check type less probable than this is a guess, not a draft. */
const MIN_PRESET_PROBABILITY = 0.1;
const YES = 0.5;

const distinct = <T>(values: readonly T[]): T[] => [...new Set(values)].slice(0, CANDIDATES);
const sureness = (probability: number) => Math.max(probability, 1 - probability);

/** What AI is told about a rule, and the context its answers are read in. */
export function aiDraftInput(
  text: string,
  columns: readonly DraftColumn[],
  vocabulary: Vocabulary,
): { request: AiDraftRuleRequest; context: DraftContext } {
  const found = extractCandidates(text, vocabulary);
  const candidates = {
    amounts: distinct(found.amounts.map((amount) => amount.value)),
    grades: distinct(found.grades),
    days: distinct(found.durations.map((duration) => duration.days)),
    counts: distinct(found.counts),
  };
  const fits = (value: string) => value.length > 0 && value.length <= MAX_VALUE;
  const offered = {
    types: vocabulary.types.filter(fits).slice(0, VOCABULARY),
    documents: vocabulary.documents.filter(fits).slice(0, VOCABULARY),
  };
  const sendable = columns
    .filter(
      (column) =>
        column.name.length > 0 &&
        column.name.length <= MAX_COLUMN &&
        (column.role ?? "").length <= MAX_ROLE,
    )
    .slice(0, 200);
  const named = (types: readonly ColumnType[]) =>
    sendable.filter((column) => types.includes(column.type)).map((column) => column.name);
  return {
    request: {
      text: text.slice(0, 4000),
      columns: sendable.map(({ name, type, role }) => ({ name, type, role })),
      candidates,
      vocabulary: offered,
    },
    context: {
      candidates,
      vocabulary: offered,
      columns: {
        number: named(NUMBER_COLUMN_TYPES),
        text: named(TEXT_COLUMN_TYPES),
        any: sendable.map((column) => column.name),
      },
      alternatives: found.documentAlternatives.filter((item) => offered.documents.includes(item)),
      exceptTypes: found.exceptTypes.filter((type) => offered.types.includes(type)),
    },
  };
}

/** Whether the rule's numbers and the data's columns can give the check type its required values. */
function possible(preset: PresetId, { candidates, columns, vocabulary }: DraftContext): boolean {
  switch (preset) {
    case "field_compare":
      return candidates.amounts.length > 0 && columns.number.length > 0;
    case "required_field":
      return columns.any.length > 0;
    case "approver_min_grade":
      return candidates.amounts.length > 0 && candidates.grades.length > 0;
    case "approver_is_manager":
    case "requester_not_approver":
    case "subject_not_approver":
    case "approved_by_effective":
    case "approvals_in_order":
      return true;
    case "documents_present":
      return vocabulary.documents.length > 0;
    case "submitted_within_after_effective":
      return candidates.days.length > 0;
    case "max_count_in_window":
      return candidates.counts.length > 0 && candidates.days.length > 0;
    case "duplicate_transaction":
    case "tenure_minimum":
      return candidates.days.length > 0;
    case "text_judgment":
      return columns.text.length > 0;
  }
}

function typesFrom(decisions: AiDraftDecisions, vocabulary: Vocabulary) {
  if (decisions.everyType >= YES) return { value: null, sureness: decisions.everyType };
  const chance = (type: string) => decisions.types[type] ?? 0;
  let picked = vocabulary.types.filter((type) => chance(type) >= YES);
  // Not every type, yet none reaches yes: the likeliest types, while they beat "every type".
  const best = Math.max(0, ...vocabulary.types.map(chance));
  if (picked.length === 0 && best > decisions.everyType) {
    picked = vocabulary.types.filter((type) => chance(type) >= best - TIE);
  }
  return {
    value: picked.length > 0 ? picked : null,
    sureness: Math.min(
      1 - decisions.everyType,
      ...vocabulary.types.map((type) => sureness(decisions.types[type] ?? 0)),
    ),
  };
}

function documentsFrom(decisions: AiDraftDecisions, vocabulary: Vocabulary) {
  return {
    value: vocabulary.documents.filter((document) => (decisions.documents[document] ?? 0) >= YES),
    sureness: Math.min(
      1,
      ...vocabulary.documents.map((document) => sureness(decisions.documents[document] ?? 0)),
    ),
  };
}

/** The check type's values from AI's answers, and the answers each came from. */
function valuesFor(
  preset: PresetId,
  decisions: AiDraftDecisions,
  context: DraftContext,
): { values: Record<string, ParameterValue>; used: Answer[] } {
  const { amount, grade, days, count, operator, per, numberField, textField, anyField } = decisions;
  const types = typesFrom(decisions, context.vocabulary);
  const scope: Answer[] = [["types", types.sureness]];
  switch (preset) {
    case "field_compare":
      return {
        values: {
          types: types.value,
          field: numberField.value,
          operator: operator.value,
          value: amount.value,
        },
        used: [
          ...scope,
          ["field", numberField.probability],
          ["operator", operator.probability],
          ["value", amount.probability],
        ],
      };
    case "required_field":
      return {
        values: { types: types.value, field: anyField.value, amount_over: amount.value },
        used: [...scope, ["field", anyField.probability], ["amount_over", amount.probability]],
      };
    case "approver_min_grade":
      return {
        values: { types: types.value, amount_limit: amount.value, min_approver_grade: grade.value },
        used: [
          ...scope,
          ["amount_limit", amount.probability],
          ["min_approver_grade", grade.probability],
        ],
      };
    case "approver_is_manager":
      return {
        values: {
          types: types.value,
          approver: decisions.approver.value,
          reach: decisions.reach.value,
        },
        used: [
          ...scope,
          ["approver", decisions.approver.probability],
          ["reach", decisions.reach.probability],
        ],
      };
    case "subject_not_approver": {
      const requests = decisions.requesterToo >= YES;
      const base = types.value ?? context.vocabulary.types;
      const notRequester = requests
        ? base.filter((type) => !context.exceptTypes.includes(type))
        : [];
      return {
        values: {
          types: types.value,
          not_requester: notRequester.length > 0 ? notRequester : null,
        },
        used: [...scope, ["not_requester", sureness(decisions.requesterToo)]],
      };
    }
    case "requester_not_approver":
    case "approvals_in_order":
      return { values: { types: types.value }, used: scope };
    case "documents_present": {
      const documents = documentsFrom(decisions, context.vocabulary);
      // The alternatives come from the rule's words, which AI's answer about each one alone can't
      // capture ("a resignation or termination letter" requires neither by itself).
      const anyOf = context.alternatives;
      const all = documents.value.filter((item) => !anyOf.includes(item));
      return {
        values: {
          types: types.value,
          documents: all.length > 0 ? all : null,
          any_of: anyOf.length > 0 ? anyOf : null,
        },
        used: [...scope, ["documents", documents.sureness]],
      };
    }
    case "approved_by_effective":
      return {
        values: { types: types.value, grace_days: days.value ?? 0 },
        used: [...scope, ["grace_days", days.probability]],
      };
    case "submitted_within_after_effective":
      return {
        values: { types: types.value, max_days: days.value },
        used: [...scope, ["max_days", days.probability]],
      };
    case "max_count_in_window":
      return {
        values: {
          // Counting needs its types listed: "every type" lists the data's.
          types: types.value ?? [...context.vocabulary.types],
          max_count: count.value,
          window_days: days.value,
          per: per.value ?? "employee",
        },
        used: [
          ...scope,
          ["max_count", count.probability],
          ["window_days", days.probability],
          ["per", per.probability],
        ],
      };
    case "tenure_minimum":
      return {
        values: { types: types.value, min_days: days.value },
        used: [...scope, ["min_days", days.probability]],
      };
    case "duplicate_transaction":
      return {
        values: {
          types: types.value,
          window_days: days.value,
          same_amount: decisions.sameAmount >= YES ? "yes" : "no",
        },
        used: [
          ...scope,
          ["window_days", days.probability],
          ["same_amount", sureness(decisions.sameAmount)],
        ],
      };
    case "text_judgment":
      return {
        values: { types: types.value, text_field: textField.value, amount_over: amount.value },
        used: [
          ...scope,
          ["text_field", textField.probability],
          ["amount_over", amount.probability],
        ],
      };
  }
}

/**
 * A draft from AI's answers: the most probable check type the rule can supply values for, when it
 * is at least as probable as none fitting. Its certainty is the lower of its two asks (the options
 * reversed the second time); the draft's confidence is the least certain answer it uses.
 */
export function composeAiDraft(decisions: AiDraftDecisions, context: DraftContext): AiDraft | null {
  const [first, second] = decisions.presets;
  const chance = (option: string) => ((first[option] ?? 0) + (second[option] ?? 0)) / 2;
  const preset = PRESET_IDS.filter((option) => possible(option, context)).sort(
    (a, b) => chance(b) - chance(a),
  )[0];
  if (!preset || chance(preset) < Math.max(chance(NONE_FITS), MIN_PRESET_PROBABILITY)) return null;
  const { values, used } = valuesFor(preset, decisions, context);
  const answers: Answer[] = [
    ["preset", Math.min(first[preset] ?? 0, second[preset] ?? 0)],
    ...used,
  ];
  const [weakest, confidence] = answers.reduce((least, answer) =>
    answer[1] < least[1] ? answer : least,
  );
  return { preset, values, confidence, weakest };
}
