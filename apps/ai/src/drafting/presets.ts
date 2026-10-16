import type { PresetId } from "@hrcc/shared";

interface PresetDescription {
  checks: string;
  not_for: string;
  example: string;
}

/** What each check type tests, what it isn't for, and a rule it fits: the options Jev chooses from. */
export const PRESET_DESCRIPTIONS: Readonly<Record<PresetId, PresetDescription>> = {
  field_compare: {
    checks: "A number on the transaction must not be above (or below) a fixed limit.",
    not_for:
      "Limits that only decide who must approve, which documents are needed, or whether a field must be filled.",
    example: "One-off payments must not exceed AED 50,000.",
  },
  required_field: {
    checks: "A field on the transaction must be filled in, possibly only above an amount.",
    not_for: "Judging whether what is written in the field is good enough.",
    example: "Pay changes above AED 5,000 must include a justification.",
  },
  approver_min_grade: {
    checks: "Above an amount, at least one approver must be at or above a minimum grade number.",
    not_for: "Approver roles, titles or authority levels that aren't grade numbers.",
    example:
      "Allowance changes above AED 10,000 must be approved by an approver at Grade 10 or above.",
  },
  approver_is_manager: {
    checks:
      "An approver (the first one, or any one) must be the employee's line manager, or someone above them in the reporting line.",
    not_for: "Approver grades, titles or authority levels.",
    example: "The first approver must be the employee's line manager or someone above them.",
  },
  requester_not_approver: {
    checks: "The person who requested the transaction must not also approve it.",
    not_for: "The employee the transaction is about approving it.",
    example: "The requester cannot also approve the transaction.",
  },
  subject_not_approver: {
    checks: "The employee the transaction is about must not approve it.",
    not_for: "The requester approving it.",
    example: "Employees cannot approve their own transactions.",
  },
  documents_present: {
    checks:
      "Named documents must be attached to the transaction: all of some, and at least one of a set of alternatives (a resignation or a termination letter).",
    not_for: "Approvals, dates or amounts.",
    example:
      "Every exit must have a resignation letter or a termination letter, and a clearance form attached.",
  },
  approved_by_effective: {
    checks:
      "Approval must be given on or before the effective date, or within a few days after it.",
    not_for: "When the request was submitted.",
    example: "Pay changes must be approved on or before their effective date.",
  },
  submitted_within_after_effective: {
    checks:
      "The transaction must be submitted or requested no later than a number of days after its effective date: no late entry or backdating beyond a limit.",
    not_for: "When it was approved.",
    example: "Transactions must be submitted no later than 30 days after their effective date.",
  },
  approvals_in_order: {
    checks:
      "Every approval must come after the request was made, and each approval on or after the one listed before it.",
    not_for: "Approval compared with the effective date.",
    example: "Approvals must come after the request, in order.",
  },
  tenure_minimum: {
    checks:
      "A transaction must not take effect until the employee has served a minimum number of days since their hire date.",
    not_for: "Deadlines counted from the effective date or the request.",
    example: "Pay changes must not take effect less than 180 days after the employee's hire date.",
  },
  max_count_in_window: {
    checks: "One person may have at most a number of such transactions within a period.",
    not_for: "Duplicate transactions, or amounts added up.",
    example: "An employee may have at most 2 allowance changes in any 12-month period.",
  },
  duplicate_transaction: {
    checks:
      "The same employee must not have two transactions of the same type (and amount) with effective dates close together: the later-submitted one is a duplicate.",
    not_for: "A limit on how many transactions one person may have in a period.",
    example:
      "Two pay changes for the same employee with the same amount and effective dates 7 days or less apart are duplicates.",
  },
  text_judgment: {
    checks:
      "A written reason or justification must be clear, specific or adequate: a person has to judge what it says.",
    not_for: "Only checking that the field isn't blank.",
    example: "Justifications for pay changes above AED 5,000 must give a clear business reason.",
  },
};
