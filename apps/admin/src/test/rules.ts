import type {
  Check,
  DraftMeta,
  Parameter,
  PreviewRuleResponse,
  Rule,
  RulesDataset,
  RuleVersion,
} from "@hrcc/shared";

export const DATASET: RulesDataset = {
  id: "5d9b5c1e-3f0a-4c8e-9a71-2b6f4e8d1c30",
  name: "Training pack",
  transactionCount: 300,
  columns: [
    { name: "transaction_id", type: "id", role: "transaction_id" },
    { name: "type", type: "category", role: "type" },
    { name: "amount", type: "integer", role: "amount" },
    { name: "justification", type: "text", role: "text" },
  ],
  vocabulary: {
    types: ["allowance_change", "overtime", "pay_change"],
    documents: ["allowance_form", "resignation_letter"],
  },
};

export const PARAMETERS: Parameter[] = [
  { name: "types", type: "string[]", value: ["allowance_change"], editedByAdmin: false },
  { name: "amount_limit", type: "number", value: 10000, editedByAdmin: false },
  { name: "min_approver_grade", type: "integer", value: 10, editedByAdmin: false },
];
export const VALUES = { types: ["allowance_change"], amount_limit: 10000, min_approver_grade: 10 };
export const CHECK: Check = {
  checkKind: "structured",
  preset: "approver_min_grade",
  appliesTo: true,
  logic: true,
  fieldsUsed: ["amount"],
  parameters: PARAMETERS,
};
export const RESTATEMENT_EN =
  "Flags allowance_change transactions over 10,000 where no approver is grade 10 or above.";
export const RESTATEMENT_AR =
  "يُبلَّغ عن المعاملات من نوع allowance_change التي يزيد مبلغها على 10,000 عندما لا يكون بين المعتمِدين من درجته 10 أو أعلى.";
export const SOURCE =
  "Allowance changes above AED 10,000 must be approved by at least one approver at Grade 10 or above.";
export const SUGGESTED_EN =
  "Get approval from an approver at the required grade, or reverse the change.";
export const SUGGESTED_AR = "احصل على اعتماد من معتمِد في الدرجة المطلوبة، أو ألغِ التغيير.";

/** R-01's first version as drafted from the synthetic policy; tests change only what they're about. */
export function ruleVersion(overrides: Partial<RuleVersion> = {}): RuleVersion {
  return {
    version: 1,
    status: "draft",
    sourceText: SOURCE,
    preset: "approver_min_grade",
    parameters: PARAMETERS,
    check: CHECK,
    needs: [],
    restatementEn: RESTATEMENT_EN,
    restatementAr: RESTATEMENT_AR,
    severity: "High",
    ownerTeam: null,
    suggestedActionEn: SUGGESTED_EN,
    suggestedActionAr: SUGGESTED_AR,
    draftedBy: "keywords",
    draftError: null,
    draftMeta: null,
    createdAt: "2026-10-16T08:00:00.000Z",
    createdBy: "Layla Haddad",
    approvedAt: null,
    approvedBy: null,
    closedAt: null,
    closedBy: null,
    reason: null,
    closedFor: null,
    ...overrides,
  };
}

export function ruleOf(
  versions: RuleVersion[],
  { id = "R-01", title = "Approval of large allowance changes", rowVersion = 1 } = {},
): Rule {
  return {
    id,
    title,
    requestedBy: null,
    rowVersion,
    createdAt: "2026-10-16T08:00:00.000Z",
    versions,
  };
}

export const APPROVED = { approvedAt: "2026-10-16T09:00:00.000Z", approvedBy: "Layla Haddad" };

export const PREVIEW: PreviewRuleResponse = {
  dataset: { id: DATASET.id, name: DATASET.name, transactionCount: 300 },
  result: {
    status: "ok",
    check: CHECK,
    restatementEn: RESTATEMENT_EN,
    restatementAr: RESTATEMENT_AR,
    preview: {
      counts: {
        not_applicable: 212,
        passed: 81,
        flagged: 7,
        could_not_check: 0,
        needs_judgment: 0,
      },
      total: 300,
      applicable: 88,
      flagged: [
        {
          rowNo: 4,
          transactionId: "TX-000004",
          evidence: [{ field: "amount", value: "16200", condition: "> 10000" }],
        },
      ],
      nearMisses: [
        {
          rowNo: 9,
          transactionId: "TX-000009",
          reason: "amount_just_under_limit",
          facts: [{ field: "amount", value: "9900", condition: "<= 10000" }],
        },
      ],
      missing: [],
      errors: [],
      warnings: [],
    },
  },
};

/** How AI drafted R-01: least sure about the approver grade. */
export const AI_META: DraftMeta = {
  ai: {
    model: "jev-1.13.0",
    questionSet: "rule-draft-v1",
    confidence: 0.81,
    weakest: "min_approver_grade",
  },
  aiProblem: null,
  suggestedActionBy: "claude",
};
