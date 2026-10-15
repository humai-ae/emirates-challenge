import { describe, expect, it } from "vitest";
import {
  JUDGMENT_PRESET_IDS,
  PRESET_CATALOGUE,
  PRESET_IDS,
  PreviewRuleResponseSchema,
  RuleReasonRequestSchema,
  RuleSchema,
  UpdateDraftRequestSchema,
} from "./index.js";

const version = {
  version: 1,
  status: "draft",
  sourceText:
    "Allowance changes above AED 10,000 must be approved by at least one approver at Grade 10 or above.",
  preset: "approver_min_grade",
  parameters: [
    { name: "types", type: "string[]", value: ["allowance_change"], editedByAdmin: false },
    { name: "amount_limit", type: "number", value: 10000, editedByAdmin: false },
    { name: "min_approver_grade", type: "integer", value: 10, editedByAdmin: true },
  ],
  check: {
    checkKind: "structured",
    preset: "approver_min_grade",
    appliesTo: true,
    logic: true,
    fieldsUsed: [],
    parameters: [],
  },
  needs: [],
  restatementEn:
    "Flags allowance_change transactions over 10,000 where no approver is grade 10 or above.",
  restatementAr: "يُبلَّغ عن المعاملات من نوع allowance_change.",
  severity: "High",
  ownerTeam: null,
  suggestedActionEn: "Get approval from an approver at the required grade, or reverse the change.",
  suggestedActionAr: "احصل على اعتماد من معتمِد في الدرجة المطلوبة، أو ألغِ التغيير.",
  draftedBy: "keywords",
  draftError: null,
  createdAt: "2026-10-16T08:00:00.000Z",
  createdBy: "Layla Haddad",
  approvedAt: null,
  approvedBy: null,
  closedAt: null,
  closedBy: null,
  reason: null,
  closedFor: null,
};

const draftEdit = {
  rowVersion: 3,
  preset: "approver_min_grade",
  values: { types: ["allowance_change"], amount_limit: 10000, min_approver_grade: 10 },
  severity: "High",
  ownerTeamId: null,
  suggestedActionEn: "Get approval.",
  suggestedActionAr: "احصل على الاعتماد.",
};

describe("rules", () => {
  it("describes every check type in the catalogue", () => {
    expect(Object.keys(PRESET_CATALOGUE).sort()).toEqual([...PRESET_IDS].sort());
    for (const id of PRESET_IDS) {
      const judgment = (JUDGMENT_PRESET_IDS as readonly string[]).includes(id);
      expect(PRESET_CATALOGUE[id].checkKind === "judgment", id).toBe(judgment);
    }
    expect(PRESET_CATALOGUE.approver_min_grade.defaultSeverity).toBe("High");
    expect(PRESET_CATALOGUE.documents_present.parameters.map((spec) => spec.name)).toEqual([
      "types",
      "documents",
    ]);
  });

  it("reads a rule with its versions", () => {
    const rule = { id: "R-01", title: "Approval of large allowance changes", rowVersion: 1 };
    const parsed = RuleSchema.safeParse({
      ...rule,
      createdAt: "2026-10-16T08:00:00.000Z",
      versions: [version],
    });
    expect(parsed.success).toBe(true);
    expect(RuleSchema.safeParse({ ...rule, createdAt: "x", versions: [] }).success).toBe(false);
  });

  it("checks a draft edit and gives validation keys", () => {
    expect(UpdateDraftRequestSchema.safeParse(draftEdit).success).toBe(true);
    const blank = UpdateDraftRequestSchema.safeParse({ ...draftEdit, suggestedActionEn: "  " });
    expect(blank.error?.issues[0]?.message).toBe("required");
    const long = UpdateDraftRequestSchema.safeParse({
      ...draftEdit,
      suggestedActionAr: "x".repeat(301),
    });
    expect(long.error?.issues[0]?.message).toBe("too_long");
    expect(UpdateDraftRequestSchema.safeParse({ ...draftEdit, severity: "Critical" }).success).toBe(
      false,
    );
    expect(UpdateDraftRequestSchema.safeParse({ ...draftEdit, extra: 1 }).success).toBe(false);
  });

  it("needs a reason to reject or retire", () => {
    const empty = RuleReasonRequestSchema.safeParse({ rowVersion: 1, reason: " " });
    expect(empty.error?.issues[0]?.message).toBe("required");
    const long = RuleReasonRequestSchema.safeParse({ rowVersion: 1, reason: "x".repeat(501) });
    expect(long.error?.issues[0]?.message).toBe("too_long");
    expect(RuleReasonRequestSchema.safeParse({ rowVersion: 1, reason: "Duplicate" }).success).toBe(
      true,
    );
  });

  it("tells a preview apart from values to fix and data that is missing", () => {
    const dataset = {
      id: "5d9b5c1e-3f0a-4c8e-9a71-2b6f4e8d1c30",
      name: "Pack",
      transactionCount: 300,
    };
    const preview = {
      counts: { not_applicable: 1, passed: 2, flagged: 1, could_not_check: 0, needs_judgment: 0 },
      total: 4,
      applicable: 3,
      flagged: [
        {
          rowNo: 1,
          transactionId: "TX-1",
          evidence: [{ field: "amount", value: "16200", condition: "> 10000" }],
        },
      ],
      nearMisses: [],
      missing: [],
      errors: [],
      warnings: ["flags_many"],
    };
    const ok = {
      status: "ok",
      check: version.check,
      restatementEn: "a",
      restatementAr: "b",
      preview,
    };
    expect(PreviewRuleResponseSchema.safeParse({ dataset, result: ok }).success).toBe(true);
    const invalid = {
      status: "invalid_parameters",
      issues: [{ parameter: "amount_limit", problem: "missing" }],
    };
    expect(PreviewRuleResponseSchema.safeParse({ dataset, result: invalid }).success).toBe(true);
    const needs = { status: "needs_data", needs: [{ file: "transactions", role: "documents" }] };
    expect(PreviewRuleResponseSchema.safeParse({ dataset, result: needs }).success).toBe(true);
    expect(
      PreviewRuleResponseSchema.safeParse({ dataset, result: { status: "maybe" } }).success,
    ).toBe(false);
  });
});
