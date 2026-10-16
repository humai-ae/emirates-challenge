import type { ParameterValue, PresetId } from "@hrcc/shared";
import { extractCandidates } from "./candidates.js";
import type { PreparedDataset } from "./dataset.js";
import type { Vocabulary } from "./vocabulary.js";

/** A check type and its values, guessed from a rule's words. */
export interface DraftProposal {
  preset: PresetId;
  values: Record<string, ParameterValue>;
}

/** Lines a policy adds about a rule that aren't the rule itself: its severity, fix, owner, notes. */
const OTHER_LINE =
  /^[\s>*-]*(?:severity|suggested (?:action|fix)|corrective action|recommended action|action|owner(?: team)?|notes?|example)\s*:/i;

/** The rule's own statement: its text without the lines about severity, fixes and owners. */
function ruleStatement(text: string): string {
  return text
    .split("\n")
    .filter((line) => !OTHER_LINE.test(line))
    .join("\n");
}

/**
 * A first draft from keywords, without AI: the check type the rule's words point to, filled with
 * the values its text mentions. Only the rule's statement counts, not its severity or suggested
 * fix. Null when nothing fits, so the admin picks the check type.
 */
export function draftByKeywords(
  text: string,
  dataset: PreparedDataset,
  vocabulary: Vocabulary,
): DraftProposal | null {
  const statement = ruleStatement(text);
  const candidates = extractCandidates(statement, vocabulary);
  const words = statement.toLowerCase();
  const has = (pattern: RegExp) => pattern.test(words);
  const named = candidates.types.filter((type) => !candidates.exceptTypes.includes(type));
  // "All except EXIT": every type but the exceptions; a rule naming no type is about every type.
  const types =
    named.length > 0
      ? named
      : candidates.exceptTypes.length > 0
        ? vocabulary.types.filter((type) => !candidates.exceptTypes.includes(type))
        : null;
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
  // "Two pay changes for the same employee and amount within 7 days are duplicates."
  if (has(/\bduplicat/)) {
    return {
      preset: "duplicate_transaction",
      values: {
        types,
        window_days: duration?.days ?? null,
        same_amount: has(/\bsame\s+amount|\bamounts?\s+(?:is|are)\s+the\s+same\b/) ? "yes" : "no",
      },
    };
  }
  // "No pay change in the first 180 days after the hire date": a minimum, not a deadline after it.
  if (
    duration !== undefined &&
    has(
      /\b(hire[ _]date|hired|after hire|since hire|of hire|joining date|date of joining|joined|tenure|probation)\b/,
    ) &&
    has(/\b(not|no|never|before|until|at least|less than|first|minimum)\b/)
  ) {
    return { preset: "tenure_minimum", values: { types, min_days: duration.days } };
  }
  // "Employees must not approve their own transactions, nor request them (leave excepted)."
  if (
    has(/\bapprov/) &&
    (has(/\bapprov\w*\s+(?:their|his|her)\s+own\b(?!\s+requests?\b)/) ||
      has(/\b(?:employee|subject)\b[^.\n]*\bmust not be (?:an? |the )?approver/) ||
      (has(/\bemployee/) &&
        has(/\b(themselves|own)\b/) &&
        !has(/\brequest\w*\s+(?:their|his|her)\s+own\b/) &&
        // "approve their own requests", "approve a request they raised": the requester.
        !has(/\bapprov\w*\s+(?:an?\s+|their\s+own\s+|his\s+own\s+|her\s+own\s+)?requests?\b/)))
  ) {
    // Only a rule that says the employee mustn't request it either checks requests; its exceptions
    // say which types the employee may still request themselves.
    const scope = named.length > 0 ? named : null;
    const requests = has(
      /\b(?:nor|or|and)\s+request\b|\brequest\s+(?:them|it|their own|his own|her own)\b|\bbe\s+(?:the\s+)?request(?:er|or)\b/,
    )
      ? (scope ?? vocabulary.types).filter((type) => !candidates.exceptTypes.includes(type))
      : [];
    return {
      preset: "subject_not_approver",
      values: { types: scope, not_requester: requests.length > 0 ? requests : null },
    };
  }
  // "The person who requests a transaction must not also approve it."
  if (
    has(/\brequest/) &&
    has(/\bapprov/) &&
    (has(/\b(also|same person|themselves|own)\b/) ||
      has(
        /\brequest\w*\b[^.\n]*\b(?:must not|cannot|may not|can't|should not|never)\b[^.\n]*\bapprov/,
      ))
  ) {
    return { preset: "requester_not_approver", values: { types } };
  }
  if (candidates.grades.length > 0 && amount !== null && has(/\bapprov/)) {
    return {
      preset: "approver_min_grade",
      values: { types, amount_limit: amount, min_approver_grade: candidates.grades[0] ?? null },
    };
  }
  // "Approver 1 must be the employee's line manager, or someone above them."
  if (
    has(/\bapprov/) &&
    has(/\b(reporting line|line manager|manager_id|reports? to|chain of command|direct manager)\b/)
  ) {
    return {
      preset: "approver_is_manager",
      values: {
        types,
        approver: has(/\b(first approver|approver[ _-]?(?:1|one))(?:_id)?\b/) ? "first" : "any",
        reach: has(/\b(above|upwards|higher up|reporting line|chain of command)\b/)
          ? "reporting_line"
          : "line_manager",
      },
    };
  }
  if (candidates.documents.length > 0) {
    const alternatives = candidates.documentAlternatives;
    const all = candidates.documents.filter((item) => !alternatives.includes(item));
    return {
      preset: "documents_present",
      values: {
        types,
        documents: all.length > 0 ? all : null,
        any_of: alternatives.length > 0 ? alternatives : null,
      },
    };
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
  // "Approvals must come after the request, each after the one listed above it."
  if (
    has(/\bapprov/) &&
    has(/\b(request|submi)/) &&
    has(
      /\b(in order|in sequence|out of order|listed above|one above it|one before it|previous approval|after the request|before the request|before it was (?:requested|submitted)|after it was (?:requested|submitted))\b/,
    )
  ) {
    return { preset: "approvals_in_order", values: { types } };
  }
  if (has(/\bapprov/) && has(/\beffective/)) {
    return {
      preset: "approved_by_effective",
      values: { types, grace_days: has(/\bafter\b/) ? (duration?.days ?? 0) : 0 },
    };
  }
  // "…no later than 30 days after the effective date", "…backdated more than 30 days": late entry.
  // Not "at least 14 days before the effective date", which asks for notice in advance.
  const lateEntry =
    has(/\b(backdat\w*|late entr\w*|after (?:the |its |their )?effective)/) ||
    has(/\beffective[ _]date\b[^.\n]*\bbefore\b[^.\n]*\b(?:request|submi)/);
  if (lateEntry && duration !== undefined) {
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
