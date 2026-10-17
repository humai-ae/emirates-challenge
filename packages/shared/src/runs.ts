import { z } from "zod";
import {
  CheckOutcomeSchema,
  EvidenceSchema,
  MissingFieldSchema,
  PresetIdSchema,
  SeveritySchema,
} from "./checks.js";
import { TeamSummarySchema } from "./users.js";

/** What a finding's export row can carry; the uploaded format says which goes in which column. */
export const FINDING_FIELDS = [
  "finding_id",
  "transaction_id",
  "rule_id",
  "rule_title",
  "severity",
  "description",
  "evidence",
  "owner",
  "recommended_action",
  "employee_id",
  "transaction_type",
  "department",
  "effective_date",
  "amount",
  "run_id",
  "status",
] as const;
export const FindingFieldSchema = z.enum(FINDING_FIELDS);
export type FindingField = z.infer<typeof FindingFieldSchema>;

/** Findings are scored on these, so every format must place them. */
export const REQUIRED_FINDING_FIELDS: readonly FindingField[] = ["transaction_id", "rule_id"];

/** How the worked examples write severity: "High", "HIGH", "high" or "H". */
export const SEVERITY_STYLES = ["title", "upper", "lower", "letter"] as const;

/** Value styles learned from the worked examples. */
export const FindingFormatValuesSchema = z.object({
  severity: z.enum(SEVERITY_STYLES),
  findingIdPrefix: z.string().max(20),
  findingIdWidth: z.number().int().min(1).max(12),
  /** How dates are written, or null for YYYY-MM-DD. */
  dateFormat: z.string().nullable(),
  /** What the examples write in a status column; every finding is open until decisions exist. */
  status: z.string().max(40),
});
export type FindingFormatValues = z.infer<typeof FindingFormatValuesSchema>;

export const DEFAULT_FINDING_VALUES: FindingFormatValues = {
  severity: "title",
  findingIdPrefix: "F-",
  findingIdWidth: 4,
  dateFormat: null,
  status: "OPEN",
};

export const RUN_STATUSES = ["complete", "complete_with_errors"] as const;
export const RunStatusSchema = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof RunStatusSchema>;

/** Why AI couldn't decide a judgment rule's text, which is then "could not check". */
export const AI_CHECK_ERRORS = [
  "ai_check_failed",
  "ai_not_set_up",
  "ai_not_enough_information",
] as const;
export type AiCheckError = (typeof AI_CHECK_ERRORS)[number];
/** What Retry AI checks tries again: a failure or a missing setup, not a text too thin to judge. */
export const RETRYABLE_AI_ERRORS: readonly AiCheckError[] = ["ai_check_failed", "ai_not_set_up"];

const Counts = z.record(CheckOutcomeSchema, z.number().int().min(0));

/** One live rule version as the run used it, and what it found. */
export const RunRuleSchema = z.object({
  ruleId: z.string(),
  version: z.number().int().positive(),
  title: z.string(),
  preset: PresetIdSchema,
  severity: SeveritySchema,
  /** Null: the team for each transaction type. */
  ownerTeam: TeamSummarySchema.nullable(),
  counts: Counts,
  /** Why the check couldn't run on this dataset, when it couldn't. */
  error: z.string().nullable(),
});
export type RunRule = z.infer<typeof RunRuleSchema>;

export const RunTotalsSchema = z.object({
  transactions: z.number().int().min(0),
  findings: z.number().int().min(0),
  couldNotCheck: z.number().int().min(0),
  /** Texts a judgment rule leaves for AI to read. */
  waitingForAi: z.number().int().min(0),
  /** Flags this run raised, and open flags it found again (older runs have neither). */
  newFlags: z.number().int().min(0).default(0),
  seenAgain: z.number().int().min(0).default(0),
  /** Transactions AI couldn't check because it failed or isn't set up: Retry AI checks tries them again. */
  aiFailed: z.number().int().min(0).default(0),
  /** Unusual patterns this run raised as flags (older runs have none). */
  patterns: z.number().int().min(0).default(0),
  /** Jev is still ranking this run's patterns: their flags come when it's done. */
  findingPatterns: z.boolean().default(false),
  durationMs: z.number().int().min(0),
});
export type RunTotals = z.infer<typeof RunTotalsSchema>;

export const RunSummarySchema = z.object({
  id: z.string(),
  status: RunStatusSchema,
  dataset: z.object({ id: z.uuid(), name: z.string() }),
  startedAt: z.iso.datetime(),
  startedBy: z.string(),
  finishedAt: z.iso.datetime(),
  totals: RunTotalsSchema,
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

export const RunDetailSchema = RunSummarySchema.extend({ rules: z.array(RunRuleSchema) });
export type RunDetail = z.infer<typeof RunDetailSchema>;

export const WORKED_EXAMPLE_RESULTS = [
  "found",
  "not_flagged",
  "rule_not_run",
  "transaction_not_found",
  "incomplete",
  /** The run's dataset was deleted, so a transaction the run didn't flag can't be checked. */
  "dataset_deleted",
] as const;
export const WorkedExampleSchema = z.object({
  /** 1 for the format's first example. */
  row: z.number().int().positive(),
  transactionId: z.string(),
  ruleId: z.string(),
  result: z.enum(WORKED_EXAMPLE_RESULTS),
});
export type WorkedExample = z.infer<typeof WorkedExampleSchema>;

export const RunResponseSchema = z.object({
  run: RunDetailSchema,
  /** The confirmed format's worked examples checked against this run; null without one. */
  workedExamples: z.array(WorkedExampleSchema).nullable(),
  /** A finding format is confirmed, so the findings can be downloaded. */
  exportReady: z.boolean(),
});
export type RunResponse = z.infer<typeof RunResponseSchema>;

export const RunsListResponseSchema = z.object({ runs: z.array(RunSummarySchema) });
export type RunsListResponse = z.infer<typeof RunsListResponseSchema>;

export const StartRunRequestSchema = z.strictObject({});
export type StartRunRequest = z.infer<typeof StartRunRequestSchema>;

export const RUN_RESULT_OUTCOMES = ["flagged", "could_not_check"] as const;
export const RunResultOutcomeSchema = z.enum(RUN_RESULT_OUTCOMES);
export type RunResultOutcome = z.infer<typeof RunResultOutcomeSchema>;

export const RunResultSchema = z.object({
  /** Order in the run: rules in ID order, transactions in file order. */
  seq: z.number().int().positive(),
  ruleId: z.string(),
  ruleVersion: z.number().int().positive(),
  rowNo: z.number().int().positive(),
  transactionId: z.string().nullable(),
  outcome: RunResultOutcomeSchema,
  /** "F-0001" for a finding. */
  findingId: z.string().nullable(),
  severity: SeveritySchema,
  evidence: z.array(EvidenceSchema),
  missing: z.array(MissingFieldSchema),
  error: z.string().nullable(),
  explanationEn: z.string().nullable(),
  explanationAr: z.string().nullable(),
});
export type RunResult = z.infer<typeof RunResultSchema>;

export const RunResultsQuerySchema = z.strictObject({
  outcome: RunResultOutcomeSchema.default("flagged"),
  ruleId: z.string().min(1).optional(),
  /** The last `seq` already shown. */
  after: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type RunResultsQuery = z.infer<typeof RunResultsQuerySchema>;
export type RunResultsQueryInput = z.input<typeof RunResultsQuerySchema>;

export const RunResultsResponseSchema = z.object({
  results: z.array(RunResultSchema),
  nextAfter: z.number().int().positive().nullable(),
});
export type RunResultsResponse = z.infer<typeof RunResultsResponseSchema>;

const Mapping = z.array(FindingFieldSchema.nullable());

export const FindingFormatSchema = z.object({
  id: z.uuid(),
  filename: z.string(),
  /** The header, in order. */
  columns: z.array(z.string()),
  /** The worked examples, as written. */
  examples: z.array(z.array(z.string())),
  /** The field each column holds, in column order; null leaves the column blank. */
  mapping: Mapping,
  values: FindingFormatValuesSchema,
  confirmedAt: z.iso.datetime().nullable(),
  confirmedBy: z.string().nullable(),
  rowVersion: z.number().int().positive(),
  uploadedAt: z.iso.datetime(),
  uploadedBy: z.string(),
});
export type FindingFormat = z.infer<typeof FindingFormatSchema>;

export const FindingFormatResponseSchema = z.object({ format: FindingFormatSchema.nullable() });
export type FindingFormatResponse = z.infer<typeof FindingFormatResponseSchema>;

export const ConfirmMappingRequestSchema = z
  .strictObject({ rowVersion: z.number().int().positive(), mapping: Mapping })
  .superRefine(({ mapping }, context) => {
    const placed = mapping.filter((field): field is FindingField => field !== null);
    if (REQUIRED_FINDING_FIELDS.some((field) => !placed.includes(field))) {
      context.addIssue({ code: "custom", path: ["mapping"], message: "mapping_incomplete" });
    } else if (new Set(placed).size !== placed.length) {
      context.addIssue({ code: "custom", path: ["mapping"], message: "field_reused" });
    }
  });
export type ConfirmMappingRequest = z.infer<typeof ConfirmMappingRequestSchema>;

export const MAX_FORMAT_BYTES = 1024 * 1024;
