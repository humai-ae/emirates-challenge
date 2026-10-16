import { describe, expect, it } from "vitest";
import { extractCandidates } from "./candidates.js";
import { draftByKeywords } from "./draft.js";
import { splitPolicy } from "./policy.js";
import { dataset, tx } from "./testing/dataset.js";

const VOCABULARY = {
  types: ["allowance_change", "pay_change", "overtime", "promotion", "transfer", "exit"],
  documents: [
    "allowance_form",
    "pay_change_form",
    "timesheet",
    "promotion_form",
    "performance_review",
    "transfer_form",
    "resignation_letter",
    "clearance_form",
  ],
};

const POLICY = `# HR transaction policy (synthetic sample)

## R-01 Approval of large allowance changes
Allowance changes above AED 10,000 must be approved by at least one approver at Grade 10 or above.

## R-02 No self-approval
The person who requests a transaction must not also approve it.

## R-03 Exit documents
Every exit must have a resignation letter and a clearance form attached.

## R-04 Pay changes approved before they take effect
Pay changes must be approved on or before their effective date.

## R-05 Frequency of allowance changes
An employee may have at most 2 allowance changes in any 12-month period.

## R-06 Justification for pay changes
Pay changes above AED 5,000 must include a justification.

## R-07 Quality of justifications
Justifications for pay changes above AED 5,000 must give a clear business reason.

## R-08 Timely submission
Transactions must be submitted no later than 30 days after their effective date.
`;

const data = dataset([tx()]);
const draft = (text: string) =>
  draftByKeywords(text, extractCandidates(text, VOCABULARY), data, VOCABULARY);

describe("draftByKeywords", () => {
  it("drafts the synthetic policy the way an admin would map it", () => {
    const drafts = Object.fromEntries(
      splitPolicy(POLICY).rules.map((rule) => [rule.id, draft(rule.text)]),
    );
    expect(drafts).toEqual({
      "R-01": {
        preset: "approver_min_grade",
        values: { types: ["allowance_change"], amount_limit: 10000, min_approver_grade: 10 },
      },
      "R-02": { preset: "requester_not_approver", values: { types: null } },
      "R-03": {
        preset: "documents_present",
        values: { types: ["exit"], documents: ["resignation_letter", "clearance_form"] },
      },
      "R-04": { preset: "approved_by_effective", values: { types: ["pay_change"], grace_days: 0 } },
      "R-05": {
        preset: "max_count_in_window",
        values: { types: ["allowance_change"], max_count: 2, window_days: 365, per: "employee" },
      },
      "R-06": {
        preset: "required_field",
        values: { types: ["pay_change"], field: "justification", amount_over: 5000 },
      },
      "R-07": {
        preset: "text_judgment",
        values: { types: ["pay_change"], text_field: "justification", amount_over: 5000 },
      },
      "R-08": { preset: "submitted_within_after_effective", values: { types: null, max_days: 30 } },
    });
  });

  it("counts per requester when the rule is about requesters", () => {
    expect(draft("A manager may request no more than five transfers in any one month.")).toEqual({
      preset: "max_count_in_window",
      values: { types: ["transfer"], max_count: 5, window_days: 30, per: "requester" },
    });
  });

  it("uses every type for a frequency rule that names none", () => {
    expect(draft("No employee may have more than 3 transactions in any 30-day period.")).toEqual({
      preset: "max_count_in_window",
      values: { types: VOCABULARY.types, max_count: 3, window_days: 30, per: "employee" },
    });
  });

  it("turns 'must not exceed' into a number limit", () => {
    expect(draft("Overtime claims must not exceed AED 5,000.")).toEqual({
      preset: "field_compare",
      values: { types: ["overtime"], field: "amount", operator: ">", value: 5000 },
    });
  });

  it("tells an employee approving their own transaction from a requester approving", () => {
    expect(draft("No employee may approve their own pay change.")).toEqual({
      preset: "subject_not_approver",
      values: { types: ["pay_change"] },
    });
  });

  it("leaves a rule nothing fits for the admin", () => {
    expect(draft("Treat colleagues with respect.")).toBeNull();
  });
});

describe("drafting the newer check types by keywords", () => {
  it("drafts an approver who must be in the employee's reporting line", () => {
    expect(
      draft(
        "Approver 1 must be the employee's line manager, or someone above them in the reporting line.",
      ),
    ).toEqual({
      preset: "approver_is_manager",
      values: { types: null, approver: "first", reach: "reporting_line" },
    });
    expect(draft("Every transfer must be approved by the employee's line manager.")).toEqual({
      preset: "approver_is_manager",
      values: { types: ["transfer"], approver: "any", reach: "line_manager" },
    });
  });

  it("drafts approvals that must follow the request", () => {
    expect(draft("A transaction must not be approved before it was submitted.")).toEqual({
      preset: "approvals_in_order",
      values: { types: null },
    });
  });
});
