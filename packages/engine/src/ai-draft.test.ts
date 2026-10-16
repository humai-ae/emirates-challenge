import type { AiDraftDecisions } from "@hrcc/shared";
import { describe, expect, it } from "vitest";
import { aiDraftInput, composeAiDraft, type DraftColumn } from "./ai-draft.js";

const COLUMNS: DraftColumn[] = [
  { name: "transaction_id", type: "id", role: "transaction_id" },
  { name: "type", type: "category", role: "type" },
  { name: "amount", type: "integer", role: "amount" },
  { name: "justification", type: "text", role: "text" },
];
const VOCABULARY = {
  types: ["allowance_change", "pay_change", "exit"],
  documents: ["resignation_letter", "clearance_form"],
};
const R01 =
  "Allowance changes above AED 10,000 must be approved by at least one approver at Grade 10 or above.";

const context = (text: string) => aiDraftInput(text, COLUMNS, VOCABULARY).context;

/** Answers that fit nothing; each test sets what it is about. */
function decisions(overrides: Partial<AiDraftDecisions> = {}): AiDraftDecisions {
  const unset = { value: null, probability: 0.99 };
  return {
    presets: [{ none_fits: 0.9 }, { none_fits: 0.9 }],
    amount: unset,
    grade: unset,
    days: unset,
    count: unset,
    operator: { value: ">", probability: 0.6 },
    per: { value: "employee", probability: 0.6 },
    numberField: unset,
    textField: unset,
    anyField: unset,
    everyType: 0.9,
    types: {},
    documents: {},
    severity: { value: "Medium", probability: 0.7 },
    ...overrides,
  };
}

describe("drafting with AI", () => {
  it("tells AI the rule, the numbers in it and the data's shape, and nothing else", () => {
    const { request, context: read } = aiDraftInput(R01, COLUMNS, VOCABULARY);
    expect(request).toEqual({
      text: R01,
      columns: COLUMNS,
      candidates: { amounts: [10000], grades: [10], days: [], counts: [] },
      vocabulary: VOCABULARY,
    });
    expect(read.columns).toEqual({
      number: ["amount"],
      text: ["justification"],
      any: ["transaction_id", "type", "amount", "justification"],
    });
  });

  it("builds the check type AI chose with the values it picked, and names its least certain answer", () => {
    const draft = composeAiDraft(
      decisions({
        presets: [
          { approver_min_grade: 0.92, none_fits: 0.02 },
          { approver_min_grade: 0.88, none_fits: 0.03 },
        ],
        amount: { value: 10000, probability: 0.97 },
        grade: { value: 10, probability: 0.81 },
        everyType: 0.03,
        types: { allowance_change: 0.98, pay_change: 0.04, exit: 0.01 },
      }),
      context(R01),
    );
    expect(draft).toEqual({
      preset: "approver_min_grade",
      values: { types: ["allowance_change"], amount_limit: 10000, min_approver_grade: 10 },
      confidence: 0.81,
      weakest: "min_approver_grade",
    });
  });

  it("takes the check type's certainty from the less sure of its two asks", () => {
    const draft = composeAiDraft(
      decisions({
        presets: [
          { requester_not_approver: 0.9 },
          { requester_not_approver: 0.55, subject_not_approver: 0.4 },
        ],
        everyType: 0.97,
      }),
      context("The person who requests a transaction must not also approve it."),
    );
    expect(draft).toEqual({
      preset: "requester_not_approver",
      values: { types: null },
      confidence: 0.55,
      weakest: "preset",
    });
  });

  it("skips a check type the rule can't supply values for", () => {
    // No grade in the words, so an approver-grade check can't be filled; the amount comparison can.
    const draft = composeAiDraft(
      decisions({
        presets: [
          { approver_min_grade: 0.6, field_compare: 0.3, none_fits: 0.05 },
          { approver_min_grade: 0.5, field_compare: 0.35, none_fits: 0.1 },
        ],
        amount: { value: 50000, probability: 0.95 },
        numberField: { value: "amount", probability: 0.9 },
        operator: { value: ">", probability: 0.92 },
      }),
      context("One-off payments must not exceed AED 50,000."),
    );
    expect(draft).toEqual({
      preset: "field_compare",
      values: { types: null, field: "amount", operator: ">", value: 50000 },
      confidence: 0.3,
      weakest: "preset",
    });
  });

  it("returns nothing when none fits better", () => {
    const answers = decisions({
      presets: [
        { approved_by_effective: 0.3, none_fits: 0.6 },
        { approved_by_effective: 0.25, none_fits: 0.7 },
      ],
    });
    expect(
      composeAiDraft(answers, context("Approvers must be current employees on the approval date.")),
    ).toBeNull();
  });

  it("keeps the types AI says yes to in the data's order, and every type when it says so", () => {
    const documents = composeAiDraft(
      decisions({
        presets: [{ documents_present: 0.9 }, { documents_present: 0.9 }],
        everyType: 0.1,
        types: { exit: 0.9, pay_change: 0.8, allowance_change: 0.1 },
        documents: { clearance_form: 0.95, resignation_letter: 0.05 },
      }),
      context("Exits and pay changes need a clearance form attached."),
    );
    expect(documents?.values).toEqual({
      types: ["pay_change", "exit"],
      documents: ["clearance_form"],
    });
    const counted = composeAiDraft(
      decisions({
        presets: [{ max_count_in_window: 0.9 }, { max_count_in_window: 0.9 }],
        count: { value: 2, probability: 0.9 },
        days: { value: 365, probability: 0.9 },
        everyType: 0.8,
      }),
      context("An employee may have at most 2 changes in any 12-month period."),
    );
    // Counting needs its types listed, so "every type" lists the data's.
    expect(counted?.values).toEqual({
      types: ["allowance_change", "pay_change", "exit"],
      max_count: 2,
      window_days: 365,
      per: "employee",
    });
  });
});
