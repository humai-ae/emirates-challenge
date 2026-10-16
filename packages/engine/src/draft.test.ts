import { describe, expect, it } from "vitest";
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
    "termination_letter",
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
const draft = (text: string) => draftByKeywords(text, data, VOCABULARY);

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
        values: {
          types: ["exit"],
          documents: ["resignation_letter", "clearance_form"],
          any_of: null,
        },
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
      values: { types: ["pay_change"], not_requester: null },
    });
  });

  it("leaves a rule nothing fits for the admin", () => {
    expect(draft("Treat colleagues with respect.")).toBeNull();
  });
});

describe("drafting the newer check types by keywords", () => {
  it("drafts an employee who may not approve or request their own transactions, with the exception", () => {
    expect(
      draft(
        "Employees must not approve their own transactions or request them, except overtime, which they may request themselves.",
      ),
    ).toEqual({
      preset: "subject_not_approver",
      values: {
        types: null,
        not_requester: ["allowance_change", "pay_change", "promotion", "transfer", "exit"],
      },
    });
  });

  it("keeps requester rules worded about employees as requester rules", () => {
    expect(draft("Employees cannot approve their own requests.")?.preset).toBe(
      "requester_not_approver",
    );
    expect(draft("An employee must never approve a request they raised themselves.")?.preset).toBe(
      "requester_not_approver",
    );
  });

  it("keeps 'the requester must not approve their own request' a requester rule", () => {
    expect(draft("A requester must not approve their own request.")?.preset).toBe(
      "requester_not_approver",
    );
    expect(draft("The person in requester_id must not appear as any approver.")?.preset).toBe(
      "requester_not_approver",
    );
  });

  it("drafts letters that share a noun as alternatives", () => {
    expect(
      draft("Every exit needs a resignation or termination letter and a clearance form."),
    ).toEqual({
      preset: "documents_present",
      values: {
        types: ["exit"],
        documents: ["clearance_form"],
        any_of: ["resignation_letter", "termination_letter"],
      },
    });
  });

  it("drafts alternatives apart from the documents every transaction needs", () => {
    expect(
      draft(
        "Every exit must have a resignation letter or a termination letter, and a clearance form attached.",
      ),
    ).toEqual({
      preset: "documents_present",
      values: {
        types: ["exit"],
        documents: ["clearance_form"],
        any_of: ["resignation_letter", "termination_letter"],
      },
    });
  });

  it("drafts a minimum time after the hire date", () => {
    expect(
      draft("Pay changes must not take effect less than 180 days after the employee's hire date."),
    ).toEqual({ preset: "tenure_minimum", values: { types: ["pay_change"], min_days: 180 } });
  });

  it("drafts duplicates, with the amount when the rule asks for it", () => {
    expect(
      draft(
        "Two pay changes for the same employee with the same amount and effective dates 7 days or less apart are duplicates; the one submitted later is flagged.",
      ),
    ).toEqual({
      preset: "duplicate_transaction",
      values: { types: ["pay_change"], window_days: 7, same_amount: "yes" },
    });
  });

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
