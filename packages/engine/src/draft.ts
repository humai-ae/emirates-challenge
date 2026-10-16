import type { ParameterValue, PresetId } from "@hrcc/shared";
import type { Candidates } from "./candidates.js";
import type { PreparedDataset } from "./dataset.js";
import type { Vocabulary } from "./vocabulary.js";

/** A check type and its values, guessed from a rule's words. */
export interface DraftProposal {
  preset: PresetId;
  values: Record<string, ParameterValue>;
}

/**
 * A first draft from keywords, without AI: the check type the rule's words point to, filled with
 * the values its text mentions. Null when nothing fits, so the admin picks the check type.
 */
export function draftByKeywords(
  text: string,
  candidates: Candidates,
  dataset: PreparedDataset,
  vocabulary: Vocabulary,
): DraftProposal | null {
  const words = text.toLowerCase();
  const has = (pattern: RegExp) => pattern.test(words);
  const types = candidates.types.length > 0 ? candidates.types : null;
  const amount = candidates.amounts[0]?.value ?? null;
  const count = candidates.counts[0];
  const duration = candidates.durations[0];
  const textColumn = dataset.roleColumn("transactions", "text")?.name ?? null;
  const amountColumn = dataset.roleColumn("transactions", "amount")?.name ?? null;

  // "must give a clear business reason": whether a text is good enough needs judgment.
  if (
    textColumn &&
    has(/\b(clear|adequate|valid|sufficient|genuine|reasonable|acceptable|meaningful)\b/) &&
    has(/\b(reasons?|justifications?|explanations?|rationale)\b/)
  ) {
    return {
      preset: "text_judgment",
      values: { types, text_field: textColumn, amount_over: amount },
    };
  }
  // "The person who requests a transaction must not also approve it."
  if (has(/\brequest/) && has(/\bapprov/) && has(/\b(also|same person|themselves|own)\b/)) {
    return { preset: "requester_not_approver", values: { types } };
  }
  // "No employee may approve their own pay change."
  if (
    has(/\bapprov/) &&
    (has(/\bapprov\w*\s+(?:their|his|her)\s+own\b/) ||
      (has(/\bemployee/) && has(/\b(themselves|own)\b/)))
  ) {
    return { preset: "subject_not_approver", values: { types } };
  }
  if (candidates.grades.length > 0 && amount !== null && has(/\bapprov/)) {
    return {
      preset: "approver_min_grade",
      values: { types, amount_limit: amount, min_approver_grade: candidates.grades[0] ?? null },
    };
  }
  if (candidates.documents.length > 0) {
    return { preset: "documents_present", values: { types, documents: candidates.documents } };
  }
  if (count !== undefined && duration !== undefined) {
    return {
      preset: "max_count_in_window",
      values: {
        types: types ?? [...vocabulary.types],
        max_count: count,
        window_days: duration.days,
        per: has(/\brequest/) ? "requester" : "employee",
      },
    };
  }
  if (has(/\bapprov/) && has(/\beffective\b/)) {
    return {
      preset: "approved_by_effective",
      values: { types, grace_days: has(/\bafter\b/) ? (duration?.days ?? 0) : 0 },
    };
  }
  if (has(/\bsubmi/) && has(/\beffective\b/) && duration !== undefined) {
    return {
      preset: "submitted_within_after_effective",
      values: { types, max_days: duration.days },
    };
  }
  if (
    textColumn &&
    has(/\b(include|contain|state|give|provide|have|record)\b/) &&
    has(/\b(justifications?|reasons?|explanations?|comments?|notes?)\b/)
  ) {
    return {
      preset: "required_field",
      values: { types, field: textColumn, amount_over: amount },
    };
  }
  if (amountColumn && amount !== null && has(/\b(not|never|cannot|can't|may not|must not|no)\b/)) {
    if (has(/\b(exceed|above|over|more than|greater than)\b/)) {
      return {
        preset: "field_compare",
        values: { types, field: amountColumn, operator: ">", value: amount },
      };
    }
    if (has(/\b(below|under|less than)\b/)) {
      return {
        preset: "field_compare",
        values: { types, field: amountColumn, operator: "<", value: amount },
      };
    }
  }
  return null;
}
