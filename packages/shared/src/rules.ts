import { z } from "zod";
import {
  CheckOutcomeSchema,
  CheckSchema,
  EvidenceSchema,
  MissingReasonSchema,
  ParameterSchema,
  ParameterValueSchema,
  PresetIdSchema,
  SeveritySchema,
} from "./checks.js";
import { ColumnTypeSchema, DatasetFileKindSchema } from "./datasets.js";
import { TeamSummarySchema } from "./users.js";

export const RULE_STATUSES = [
  "draft",
  "needs_data",
  "draft_failed",
  "active",
  "rejected",
  "retired",
] as const;
export const RuleStatusSchema = z.enum(RULE_STATUSES);
export type RuleStatus = z.infer<typeof RuleStatusSchema>;

/** A version still waiting for an admin's decision. */
export const OPEN_RULE_STATUSES: readonly RuleStatus[] = ["draft", "needs_data", "draft_failed"];

/** How a draft was made: from the rule's own words, or by an admin choosing the check type. */
export const DRAFT_METHODS = ["keywords", "admin"] as const;
export const DraftMethodSchema = z.enum(DRAFT_METHODS);
export type DraftMethod = z.infer<typeof DraftMethodSchema>;

/** A role the dataset has no column for, which a check needs. */
export const NeededFieldSchema = z.object({ file: DatasetFileKindSchema, role: z.string() });
export type NeededField = z.infer<typeof NeededFieldSchema>;

export const PARAMETER_PROBLEMS = [
  "unknown",
  "repeated",
  "wrong_type",
  "missing",
  "not_a_choice",
  "too_small",
  "unknown_column",
  "column_type",
] as const;
export type ParameterProblem = (typeof PARAMETER_PROBLEMS)[number];
export const ParameterIssueSchema = z.object({
  parameter: z.string(),
  problem: z.enum(PARAMETER_PROBLEMS),
});
export type ParameterIssue = z.infer<typeof ParameterIssueSchema>;

export const POLICY_WARNING_CODES = ["duplicate_id", "no_structure", "empty_rule"] as const;
export const PolicyWarningSchema = z.object({
  code: z.enum(POLICY_WARNING_CODES),
  id: z.string().nullable(),
  /** For a repeated ID, the ID the repeat was given. */
  renamedTo: z.string().nullable(),
});
export type PolicyWarning = z.infer<typeof PolicyWarningSchema>;

/** A policy's own rule ID, or one the system assigned (`R-01`). */
export const RuleIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/);

/**
 * Why the system closed a version: the policy was uploaded again with a new text for the rule, a
 * newer version was approved, or the rule was retired while this draft was open.
 */
export const CLOSED_FOR = ["policy_reupload", "replaced", "rule_retired"] as const;
export const ClosedForSchema = z.enum(CLOSED_FOR);
export type ClosedFor = z.infer<typeof ClosedForSchema>;

export const RuleVersionSchema = z.object({
  version: z.number().int().positive(),
  status: RuleStatusSchema,
  /** The rule text this version was drafted from, as written in the policy. */
  sourceText: z.string(),
  preset: PresetIdSchema.nullable(),
  parameters: z.array(ParameterSchema),
  check: CheckSchema.nullable(),
  needs: z.array(NeededFieldSchema),
  restatementEn: z.string().nullable(),
  restatementAr: z.string().nullable(),
  severity: SeveritySchema,
  /** Null: the team for each transaction type. */
  ownerTeam: TeamSummarySchema.nullable(),
  suggestedActionEn: z.string(),
  suggestedActionAr: z.string(),
  draftedBy: DraftMethodSchema,
  /** `no_match`: no check type matched the rule's words. */
  draftError: z.enum(["no_match"]).nullable(),
  createdAt: z.iso.datetime(),
  createdBy: z.string(),
  approvedAt: z.iso.datetime().nullable(),
  approvedBy: z.string().nullable(),
  /** When the version was rejected or retired, and by whom. */
  closedAt: z.iso.datetime().nullable(),
  closedBy: z.string().nullable(),
  /** What the admin wrote when rejecting or retiring. */
  reason: z.string().nullable(),
  /** Set instead of a reason when the system closed the version. */
  closedFor: ClosedForSchema.nullable(),
});
export type RuleVersion = z.infer<typeof RuleVersionSchema>;

export const RuleSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Sent back with every change, so a change made on a stale copy is refused. */
  rowVersion: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  /** Newest first. */
  versions: z.array(RuleVersionSchema).min(1),
});
export type Rule = z.infer<typeof RuleSchema>;

/** The dataset rules are matched against: its transactions columns and the values checks choose from. */
export const RulesDatasetSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  transactionCount: z.number().int().min(0),
  columns: z.array(
    z.object({ name: z.string(), type: ColumnTypeSchema, role: z.string().nullable() }),
  ),
  vocabulary: z.object({ types: z.array(z.string()), documents: z.array(z.string()) }),
});
export type RulesDataset = z.infer<typeof RulesDatasetSchema>;

export const RulesListResponseSchema = z.object({
  rules: z.array(RuleSchema),
  dataset: RulesDatasetSchema.nullable(),
});
export type RulesListResponse = z.infer<typeof RulesListResponseSchema>;

export const RuleResponseSchema = z.object({
  rule: RuleSchema,
  dataset: RulesDatasetSchema.nullable(),
});
export type RuleResponse = z.infer<typeof RuleResponseSchema>;

export const PolicyUploadResponseSchema = z.object({
  upload: z.object({
    id: z.uuid(),
    filename: z.string(),
    rulesFound: z.number().int().min(0),
    created: z.array(z.string()),
    changed: z.array(z.string()),
    unchanged: z.array(z.string()),
    warnings: z.array(PolicyWarningSchema),
  }),
});
export type PolicyUploadResponse = z.infer<typeof PolicyUploadResponseSchema>;

export const MAX_POLICY_BYTES = 1024 * 1024;

export const CreateRuleRequestSchema = z.strictObject({
  text: z.string().trim().min(1, { error: "required" }).max(2000, { error: "too_long" }),
});
export type CreateRuleRequest = z.infer<typeof CreateRuleRequestSchema>;

const RowVersion = z.number().int().positive();
/** Parameter values by name, as a form holds them. */
const ParameterValues = z.record(z.string(), ParameterValueSchema);

export const UpdateDraftRequestSchema = z.strictObject({
  rowVersion: RowVersion,
  preset: PresetIdSchema,
  values: ParameterValues,
  severity: SeveritySchema,
  ownerTeamId: z.uuid().nullable(),
  suggestedActionEn: z
    .string()
    .trim()
    .min(1, { error: "required" })
    .max(300, { error: "too_long" }),
  suggestedActionAr: z
    .string()
    .trim()
    .min(1, { error: "required" })
    .max(300, { error: "too_long" }),
});
export type UpdateDraftRequest = z.infer<typeof UpdateDraftRequestSchema>;

export const RuleChangeRequestSchema = z.strictObject({ rowVersion: RowVersion });
export type RuleChangeRequest = z.infer<typeof RuleChangeRequestSchema>;

export const RuleReasonRequestSchema = z.strictObject({
  rowVersion: RowVersion,
  reason: z.string().trim().min(1, { error: "required" }).max(500, { error: "too_long" }),
});
export type RuleReasonRequest = z.infer<typeof RuleReasonRequestSchema>;

export const PreviewRuleRequestSchema = z.strictObject({
  preset: PresetIdSchema,
  values: ParameterValues,
});
export type PreviewRuleRequest = z.infer<typeof PreviewRuleRequestSchema>;

export const PREVIEW_WARNINGS = ["applies_to_none", "flags_none", "flags_many"] as const;

/** What a check would do on the data: counts, sample flags and near misses. */
export const PreviewSchema = z.object({
  counts: z.record(CheckOutcomeSchema, z.number().int().min(0)),
  total: z.number().int().min(0),
  applicable: z.number().int().min(0),
  flagged: z.array(
    z.object({
      rowNo: z.number().int().positive(),
      transactionId: z.string().nullable(),
      evidence: z.array(EvidenceSchema),
    }),
  ),
  nearMisses: z.array(
    z.object({
      rowNo: z.number().int().positive(),
      transactionId: z.string().nullable(),
      reason: z.string(),
      facts: z.array(EvidenceSchema),
    }),
  ),
  missing: z.array(
    z.object({ field: z.string(), reason: MissingReasonSchema, count: z.number().int().min(0) }),
  ),
  errors: z.array(z.object({ message: z.string(), count: z.number().int().min(0) })),
  warnings: z.array(z.enum(PREVIEW_WARNINGS)),
});
export type Preview = z.infer<typeof PreviewSchema>;

export const PreviewRuleResponseSchema = z.object({
  dataset: z.object({
    id: z.uuid(),
    name: z.string(),
    transactionCount: z.number().int().min(0),
  }),
  result: z.discriminatedUnion("status", [
    z.object({
      status: z.literal("ok"),
      check: CheckSchema,
      restatementEn: z.string(),
      restatementAr: z.string(),
      preview: PreviewSchema,
    }),
    z.object({ status: z.literal("invalid_parameters"), issues: z.array(ParameterIssueSchema) }),
    z.object({ status: z.literal("needs_data"), needs: z.array(NeededFieldSchema) }),
  ]),
});
export type PreviewRuleResponse = z.infer<typeof PreviewRuleResponseSchema>;
