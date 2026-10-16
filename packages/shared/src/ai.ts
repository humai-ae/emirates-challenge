import { z } from "zod";
import { COMPARISON_OPERATORS, SeveritySchema } from "./checks.js";
import { type ColumnType, ColumnTypeSchema } from "./datasets.js";

/** Column types a rule's number can come from, and its written reason; any column can be required. */
export const NUMBER_COLUMN_TYPES: readonly ColumnType[] = ["integer", "number"];
export const TEXT_COLUMN_TYPES: readonly ColumnType[] = ["text"];

/** The check-type option meaning no check type fits the rule. */
export const NONE_FITS = "none_fits";

export const AI_ERROR_CODES = [
  "provider_not_configured",
  "provider_failed",
  "validation_failed",
] as const;
export const AiErrorBodySchema = z.object({
  code: z.enum(AI_ERROR_CODES),
  params: z.record(z.string(), z.unknown()).default({}),
});
export type AiErrorBody = z.infer<typeof AiErrorBodySchema>;

/** Where an AI answer came from, kept with what it decided. */
export const AiProvenanceSchema = z.object({
  provider: z.enum(["typesafe", "foundry"]),
  model: z.string(),
  /** The question set or prompt version. */
  version: z.string(),
  inputSha256: z.string().regex(/^[0-9a-f]{64}$/),
  latencyMs: z.number().int().min(0),
});
export type AiProvenance = z.infer<typeof AiProvenanceSchema>;

const Probability = z.number().min(0).max(1);

/** A value AI picked from those offered; null when it answered that the rule doesn't state one. */
function selection<T extends z.ZodType>(value: T) {
  return z.object({ value: value.nullable(), probability: Probability });
}

/** Everything AI may see to draft a rule: the rule, numbers code found in it, and the data's shape. */
export const AiDraftRuleRequestSchema = z.strictObject({
  text: z.string().min(1).max(4000),
  columns: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(128),
        type: ColumnTypeSchema,
        role: z.string().max(40).nullable(),
      }),
    )
    .max(200),
  candidates: z.strictObject({
    amounts: z.array(z.number().nonnegative()).max(20),
    grades: z.array(z.number().int()).max(20),
    days: z.array(z.number().int().nonnegative()).max(20),
    counts: z.array(z.number().int().nonnegative()).max(20),
  }),
  vocabulary: z.strictObject({
    types: z.array(z.string().min(1).max(64)).max(50),
    documents: z.array(z.string().min(1).max(64)).max(50),
  }),
});
export type AiDraftRuleRequest = z.infer<typeof AiDraftRuleRequestSchema>;

export const AiDraftRuleResponseSchema = z.object({
  /** Each check type's probability, and NONE_FITS's: asked twice, the second time in reverse order. */
  presets: z.tuple([z.record(z.string(), Probability), z.record(z.string(), Probability)]),
  amount: selection(z.number()),
  grade: selection(z.number().int()),
  days: selection(z.number().int()),
  count: selection(z.number().int()),
  operator: selection(z.enum(COMPARISON_OPERATORS)),
  per: selection(z.enum(["employee", "requester"])),
  numberField: selection(z.string()),
  textField: selection(z.string()),
  anyField: selection(z.string()),
  /** That the rule applies to every transaction type. */
  everyType: Probability,
  /** Per transaction type, that the rule applies to it. */
  types: z.record(z.string(), Probability),
  /** Per document, that the rule requires it. */
  documents: z.record(z.string(), Probability),
  severity: z.object({ value: SeveritySchema, probability: Probability }),
  provenance: AiProvenanceSchema,
});
export type AiDraftRuleResponse = z.infer<typeof AiDraftRuleResponseSchema>;
/** What AI answered about a rule, without where the answers came from. */
export type AiDraftDecisions = Omit<AiDraftRuleResponse, "provenance">;

export const AiRuleActionRequestSchema = z.strictObject({
  ruleId: z.string().min(1).max(32),
  title: z.string().min(1).max(200),
  text: z.string().min(1).max(4000),
  /** The check type's standard wording, for reference. */
  referenceEn: z.string().min(1).max(300),
});
export type AiRuleActionRequest = z.infer<typeof AiRuleActionRequestSchema>;

export const AiRuleActionResponseSchema = z.object({
  en: z.string().min(1).max(300),
  ar: z.string().min(1).max(300),
  provenance: AiProvenanceSchema,
});
export type AiRuleActionResponse = z.infer<typeof AiRuleActionResponseSchema>;

export const AiRoutingRequestSchema = z.strictObject({
  types: z.array(z.string().min(1).max(64)).min(1).max(50),
  teams: z.array(z.string().min(1).max(80)).min(1).max(40),
});
export type AiRoutingRequest = z.infer<typeof AiRoutingRequestSchema>;

export const AiRoutingResponseSchema = z.object({
  owners: z.array(
    z.object({ type: z.string(), team: z.string().nullable(), probability: Probability }),
  ),
  provenance: AiProvenanceSchema,
});
export type AiRoutingResponse = z.infer<typeof AiRoutingResponseSchema>;
