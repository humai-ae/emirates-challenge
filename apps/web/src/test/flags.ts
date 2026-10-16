import type { FlagDetail, FlagSummary } from "@hrcc/shared";

export const PAYROLL = {
  id: "3c4d5e6f-7a8b-4c3d-8e4f-5a6b7c8d9e0f",
  nameEn: "Payroll & Compensation",
  nameAr: "الرواتب والتعويضات",
};
export const ONBOARDING = {
  id: "4d5e6f7a-8b9c-4d4e-9f5a-6b7c8d9e0f1a",
  nameEn: "Onboarding",
  nameAr: null,
};

export function flagSummary(overrides: Partial<FlagSummary> = {}): FlagSummary {
  return {
    id: "F-000001",
    kind: "rule_break",
    status: "with_analyst",
    ruleId: "R-01",
    ruleTitle: "Approval of large allowance changes",
    transactionIds: ["TX-000006"],
    explanationEn:
      "The amount 11,100 is over 10,000, and no approver is grade 10 or above (approver grades: 6).",
    explanationAr:
      "المبلغ 11,100 أعلى من 10,000، ولا يوجد معتمد بدرجة 10 أو أعلى (درجات المعتمدين: 6).",
    severity: "High",
    ownerTeam: PAYROLL,
    dueDate: "2026-10-19",
    overdue: false,
    assignee: null,
    fix: null,
    sentBack: null,
    seenAgain: 0,
    runId: "RUN-2026-10-16-01",
    createdAt: "2026-10-16T08:00:00.000Z",
    ...overrides,
  };
}

export function flagDetail(overrides: Partial<FlagDetail> = {}): FlagDetail {
  return {
    ...flagSummary(),
    ruleVersion: 1,
    ruleText:
      "Allowance changes above AED 10,000 must be approved by at least one approver at Grade 10 or above.",
    restatementEn: "Flags allowance changes over 10,000 where no approver is grade 10 or above.",
    restatementAr: "يرصد تغييرات البدلات التي تتجاوز 10,000 دون معتمد بدرجة 10 أو أعلى.",
    evidence: [
      { field: "amount", value: "11100", condition: "> 10000" },
      { field: "approvers[].grade", value: ["6"], condition: "none >= 10" },
    ],
    transaction: [
      { column: "transaction_id", value: "TX-000006" },
      { column: "type", value: "allowance_change" },
      { column: "amount", value: "11100" },
    ],
    people: [
      { role: "employee", id: "E-0049", found: true, grade: "3", department: "Human Resources" },
      { role: "requester", id: "E-0038", found: true, grade: "4", department: "Human Resources" },
      { role: "approver", id: "E-0024", found: true, grade: "6", department: "Human Resources" },
    ],
    severityReasons: [{ code: "rule_default", severity: "High" }],
    reportTo: {
      level: "hr_manager",
      severity: "High",
      band: "mid",
      basis: { role: "approver", id: "E-0024", grade: 6 },
      personId: null,
    },
    suggestedFixEn: "Get retrospective approval from a grade 10 or higher approver, or reverse it.",
    suggestedFixAr: "احصل على موافقة بأثر رجعي من معتمد بدرجة 10 أو أعلى، أو ألغِ التغيير.",
    explanationSource: "template",
    decision: null,
    assignment: null,
    verification: null,
    seenAgainRuns: [],
    related: [],
    timeline: [],
    rowVersion: 1,
    allowed: ["confirm", "dismiss"],
    assignees: [],
    teams: [ONBOARDING, PAYROLL],
    ...overrides,
  };
}
