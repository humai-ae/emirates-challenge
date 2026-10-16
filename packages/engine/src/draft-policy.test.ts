import { describe, expect, it } from "vitest";
import { draftByKeywords } from "./draft.js";
import { splitPolicy } from "./policy.js";
import { dataset, tx } from "./testing/dataset.js";

const VOCABULARY = {
  types: ["LEAVE", "ALLOWANCE_CHANGE", "PAY_CHANGE", "ONE_OFF_PAYMENT", "TRANSFER", "HIRE", "EXIT"],
  documents: [
    "approval_memo",
    "transfer_letter",
    "offer_letter",
    "signed_contract",
    "passport_copy",
    "medical_clearance",
    "resignation_letter",
    "termination_letter",
    "clearance_form",
  ],
};

const rule = (id: string, title: string, appliesTo: string, body: string, action: string) =>
  `### ${id}: ${title}\n\n- **Applies to:** ${appliesTo}\n- **Rule:** ${body}\n- **Severity:** Medium\n- **Suggested action:** ${action}\n`;

/** One rule per kind the brief names, written the way a brief-style policy writes them. */
const POLICY = [
  "# HR policy (synthetic test policy)\n\n## Rules\n",
  rule(
    "R01",
    "Allowance changes above AED 3,000 need a senior HR approver",
    "ALLOWANCE_CHANGE",
    "If an allowance change is more than AED 3,000 a month, one approver must hold HR_MANAGER or HR_DIRECTOR authority.",
    "Record the senior HR sign-off, or hold the change.",
  ),
  rule(
    "R03",
    "Pay rises above 15% of basic pay need the HR Director",
    "PAY_CHANGE",
    "If a monthly increase is more than 15% of current_basic_aed, one approver must hold HR_DIRECTOR authority.",
    "Record the HR Director sign-off, or hold the increase.",
  ),
  rule(
    "R04",
    "The requester cannot approve",
    "All",
    "The person in requester_id must not appear as any approver (approver_1_id, approver_2_id, approver_3_id).",
    "Ask an independent authorised person to sign off, and find out how the system let it through.",
  ),
  rule(
    "R05",
    "Employees cannot approve or request their own transactions",
    "All",
    "The employee the transaction is about (employee_id) must not be an approver. They must not be the requester either, except for LEAVE, which employees may request for themselves.",
    "Send it to an independent approver and check whether anything was paid.",
  ),
  rule(
    "R06",
    "Approver 1 sits in the employee's reporting line",
    "All",
    "approver_1_id must be the employee's line manager, or someone above them in the reporting line (follow manager_id upwards in employees.csv).",
    "Get sign-off from the employee's line manager or someone above them.",
  ),
  rule(
    "R07",
    "Hires need HR sign-off",
    "HIRE",
    "Every HIRE needs one approver with HR_OFFICER, HR_MANAGER or HR_DIRECTOR authority; a hire at grade 8 or above needs HR_DIRECTOR authority.",
    "Record the missing HR sign-off before onboarding goes on.",
  ),
  rule(
    "R08",
    "Hire paperwork",
    "HIRE",
    "documents_attached on a HIRE must include all of: offer_letter, signed_contract, passport_copy, medical_clearance.",
    "Collect the missing papers and attach them to the hire.",
  ),
  rule(
    "R09",
    "Pay and allowance changes need a memo",
    "PAY_CHANGE, ALLOWANCE_CHANGE",
    "documents_attached on a PAY_CHANGE or ALLOWANCE_CHANGE must include approval_memo.",
    "Attach the memo, or get one signed.",
  ),
  rule(
    "R10",
    "Exit paperwork",
    "EXIT",
    "documents_attached on an EXIT must include resignation_letter or termination_letter, and must include clearance_form.",
    "Collect the missing papers before the final settlement.",
  ),
  rule(
    "R11",
    "Limited backdating",
    "PAY_CHANGE, ALLOWANCE_CHANGE",
    "effective_date must not be more than 30 days before the date part of requested_at.",
    "Confirm the backdating was authorised, and recover any arrears paid.",
  ),
  rule(
    "R12",
    "Hires and transfers are fully approved in time",
    "HIRE, TRANSFER",
    "The date of every approval (approver_N_at) must be on or before effective_date.",
    "Record why the change took effect first, and confirm it is approved now.",
  ),
  rule(
    "R13",
    "Long annual leave needs a senior HR approver",
    "LEAVE",
    "ANNUAL leave with leave_days more than 30 needs an approver with HR_MANAGER or HR_DIRECTOR authority.",
    "Record the senior HR sign-off for the long leave.",
  ),
  rule(
    "R14",
    "Nothing takes effect after an exit",
    "All except EXIT",
    "No transaction other than the EXIT itself may have an effective_date after the employee's exit_date in employees.csv.",
    "Stop the change and recover anything paid after the exit.",
  ),
  rule(
    "R15",
    "Transfers need a letter",
    "TRANSFER",
    "documents_attached on a TRANSFER must include transfer_letter.",
    "Issue the transfer letter and attach it.",
  ),
  rule(
    "R16",
    "Repeated payments",
    "PAY_CHANGE, ALLOWANCE_CHANGE, ONE_OFF_PAYMENT",
    "If two transactions have the same employee_id, the same transaction_type and the same amount_aed, and their effective dates are 7 days or less apart, the one requested later is a duplicate.",
    "Cancel the duplicate and recover any double payment.",
  ),
  rule(
    "R17",
    "Pay rises wait for six months",
    "PAY_CHANGE",
    "A PAY_CHANGE must not take effect less than 180 days after the employee's hire_date.",
    "Hold the rise until the service is complete, or record an approved exception.",
  ),
  rule(
    "R18",
    "Approvals follow the request, in order",
    "All",
    "approver_1_at must not be before requested_at, and each later approval must not be before the one listed above it.",
    "Look for back-entry or a system fault, and get it signed off again if needed.",
  ),
  rule(
    "R20",
    "Approvers are current staff",
    "All",
    "For every approval, the approval date must be on or before the approver's exit_date in employees.csv, when they have one.",
    "Get a current authorised person to sign off, and find out how a leaver's account was used.",
  ),
].join("\n");

const drafts = new Map(
  splitPolicy(POLICY).rules.map((item) => [
    item.id,
    draftByKeywords(item.text, dataset([tx()]), VOCABULARY),
  ]),
);

describe("drafting a brief-style policy without AI", () => {
  it.each([
    ["R04", { preset: "requester_not_approver", values: { types: null } }],
    [
      "R05",
      {
        preset: "subject_not_approver",
        values: {
          types: null,
          not_requester: [
            "ALLOWANCE_CHANGE",
            "PAY_CHANGE",
            "ONE_OFF_PAYMENT",
            "TRANSFER",
            "HIRE",
            "EXIT",
          ],
        },
      },
    ],
    [
      "R06",
      {
        preset: "approver_is_manager",
        values: { types: null, approver: "first", reach: "reporting_line" },
      },
    ],
    [
      "R08",
      {
        preset: "documents_present",
        values: {
          types: ["HIRE"],
          documents: ["offer_letter", "signed_contract", "passport_copy", "medical_clearance"],
          any_of: null,
        },
      },
    ],
    [
      "R09",
      {
        preset: "documents_present",
        values: {
          types: ["PAY_CHANGE", "ALLOWANCE_CHANGE"],
          documents: ["approval_memo"],
          any_of: null,
        },
      },
    ],
    [
      "R10",
      {
        preset: "documents_present",
        values: {
          types: ["EXIT"],
          documents: ["clearance_form"],
          any_of: ["resignation_letter", "termination_letter"],
        },
      },
    ],
    [
      "R11",
      {
        preset: "submitted_within_after_effective",
        values: { types: ["PAY_CHANGE", "ALLOWANCE_CHANGE"], max_days: 30 },
      },
    ],
    [
      "R12",
      { preset: "approved_by_effective", values: { types: ["HIRE", "TRANSFER"], grace_days: 0 } },
    ],
    [
      "R15",
      {
        preset: "documents_present",
        values: { types: ["TRANSFER"], documents: ["transfer_letter"], any_of: null },
      },
    ],
    [
      "R16",
      {
        preset: "duplicate_transaction",
        values: {
          types: ["PAY_CHANGE", "ALLOWANCE_CHANGE", "ONE_OFF_PAYMENT"],
          window_days: 7,
          same_amount: "yes",
        },
      },
    ],
    ["R17", { preset: "tenure_minimum", values: { types: ["PAY_CHANGE"], min_days: 180 } }],
    ["R18", { preset: "approvals_in_order", values: { types: null } }],
  ])("drafts %s", (id, expected) => {
    expect(drafts.get(id)).toEqual(expected);
  });

  it("leaves rules that need columns outside the brief for the admin", () => {
    for (const id of ["R01", "R03", "R07", "R13", "R14", "R20"])
      expect(drafts.get(id), id).toBeNull();
  });
});

describe("keyword drafting reads the rule, not its other lines", () => {
  const draftOf = (appliesTo: string, body: string, action: string) => {
    const [item] = splitPolicy(
      `# Policy\n\n${rule("R30", "A rule", appliesTo, body, action)}`,
    ).rules;
    if (!item) throw new Error("The rule wasn't split");
    return draftByKeywords(item.text, dataset([tx()]), VOCABULARY);
  };

  it.each([
    [
      "an approver-grade rule whose fix mentions the line manager",
      "ALLOWANCE_CHANGE",
      "If an allowance change is more than AED 10,000, one approver must be at grade 10 or above.",
      "Ask the employee's line manager to get the approval on record.",
      {
        preset: "approver_min_grade",
        values: { types: ["ALLOWANCE_CHANGE"], amount_limit: 10000, min_approver_grade: 10 },
      },
    ],
    [
      "a frequency rule whose fix mentions a duplicate",
      "ALLOWANCE_CHANGE",
      "An employee may have at most 2 allowance changes in any 12-month period.",
      "Check for a duplicate payment and recover it.",
      {
        preset: "max_count_in_window",
        values: {
          types: ["ALLOWANCE_CHANGE"],
          max_count: 2,
          window_days: 365,
          per: "employee",
        },
      },
    ],
    [
      "an approval deadline whose fix mentions the request",
      "HIRE, TRANSFER",
      "The date of every approval must be on or before effective_date.",
      "Check whether the approval was entered before the request was made.",
      { preset: "approved_by_effective", values: { types: ["HIRE", "TRANSFER"], grace_days: 0 } },
    ],
    [
      "an employee check whose fix mentions the requester",
      "PAY_CHANGE",
      "No employee may approve their own pay change.",
      "Send it to the requester's manager instead.",
      { preset: "subject_not_approver", values: { types: ["PAY_CHANGE"], not_requester: null } },
    ],
    [
      "a document deadline counted from the hire",
      "HIRE",
      "New hires must attach a passport_copy within 30 days of hire.",
      "Collect the copy.",
      {
        preset: "documents_present",
        values: { types: ["HIRE"], documents: ["passport_copy"], any_of: null },
      },
    ],
  ])("drafts %s", (_name, appliesTo, body, action, expected) => {
    expect(draftOf(appliesTo, body, action)).toEqual(expected);
  });

  it("leaves notice asked in advance for the admin, rather than reading it as backdating", () => {
    expect(
      draftOf(
        "LEAVE",
        "Leave requests must be made at least 14 days before the effective date.",
        "Remind the employee of the notice period.",
      ),
    ).toBeNull();
  });
});
