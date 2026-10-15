import { z } from "zod";

/** The only operators a check may use; anything else is refused before it can run. */
export const CHECK_OPERATORS = [
  "and",
  "or",
  "!",
  "if",
  "==",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "in",
  "between",
  "var",
  "param",
  "some",
  "all",
  "none",
  "count",
  "max",
  "min",
  "missing_from",
  "days_between",
  "working_days_between",
  "hour_of",
  "weekday_of",
  "is_blank",
  "same_person",
  "in_manager_chain",
  "history_count",
  "history_sum",
] as const;
export type CheckOperator = (typeof CHECK_OPERATORS)[number];

/** Check types decided by code. */
export const STRUCTURED_PRESET_IDS = [
  "field_compare",
  "required_field",
  "approver_min_grade",
  "requester_not_approver",
  "subject_not_approver",
  "documents_present",
  "approved_by_effective",
  "submitted_within_after_effective",
  "max_count_in_window",
] as const;
/** Check types where AI reads a text; code only decides that a blank text breaks the rule. */
export const JUDGMENT_PRESET_IDS = ["text_judgment"] as const;
export const PRESET_IDS = [...STRUCTURED_PRESET_IDS, ...JUDGMENT_PRESET_IDS] as const;
export const PresetIdSchema = z.enum(PRESET_IDS);
export type PresetId = z.infer<typeof PresetIdSchema>;

export const CHECK_KINDS = ["structured", "judgment"] as const;
export const CheckKindSchema = z.enum(CHECK_KINDS);
export type CheckKind = z.infer<typeof CheckKindSchema>;

/** `column` holds the name of a transactions column, as written in the uploaded file. */
export const PARAMETER_TYPES = ["number", "integer", "string", "string[]", "column"] as const;
export const ParameterTypeSchema = z.enum(PARAMETER_TYPES);
export type ParameterType = z.infer<typeof ParameterTypeSchema>;

export const ParameterValueSchema = z.union([
  z.number(),
  z.string(),
  z.array(z.string()),
  z.null(),
]);
export type ParameterValue = z.infer<typeof ParameterValueSchema>;

function fitsType(type: ParameterType, value: ParameterValue): boolean {
  if (value === null) return true;
  switch (type) {
    case "number":
      return typeof value === "number";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "string":
    case "column":
      return typeof value === "string" && value.trim() !== "";
    case "string[]":
      return Array.isArray(value) && value.length > 0 && value.every((item) => item.trim() !== "");
  }
}

/** A value the admin edits in a form field. The check refers to it by name; `null` means not set. */
export const ParameterSchema = z
  .strictObject({
    name: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
    type: ParameterTypeSchema,
    value: ParameterValueSchema,
    editedByAdmin: z.boolean(),
  })
  .refine((parameter) => fitsType(parameter.type, parameter.value), {
    path: ["value"],
    message: "parameter_type",
  });
export type Parameter = z.infer<typeof ParameterSchema>;

/** A check expression: JSON in the restricted operator format, read by the engine, never run as code. */
export const ExpressionSchema = z.json();
export type Expression = z.infer<typeof ExpressionSchema>;

const JUDGMENT_PRESETS: readonly string[] = JUDGMENT_PRESET_IDS;

/**
 * A rule's check. `appliesTo` picks the transactions the rule is about; `logic` true means the
 * transaction breaks the rule. For a judgment check, `logic` only catches a blank text and AI
 * decides the rest.
 */
export const CheckSchema = z
  .strictObject({
    checkKind: CheckKindSchema,
    preset: PresetIdSchema,
    appliesTo: ExpressionSchema,
    logic: ExpressionSchema,
    fieldsUsed: z.array(z.string().min(1)).max(50),
    parameters: z.array(ParameterSchema).max(20),
  })
  .refine((check) => (check.checkKind === "judgment") === JUDGMENT_PRESETS.includes(check.preset), {
    path: ["checkKind"],
    message: "check_kind_mismatch",
  });
export type Check = z.infer<typeof CheckSchema>;

export const CHECK_OUTCOMES = [
  "not_applicable",
  "passed",
  "flagged",
  "could_not_check",
  "needs_judgment",
] as const;
export const CheckOutcomeSchema = z.enum(CHECK_OUTCOMES);
export type CheckOutcome = z.infer<typeof CheckOutcomeSchema>;

/**
 * One fact behind a flag: a field (or a derived fact such as a count), its value as written in the
 * file, and the test it met.
 */
export const EvidenceSchema = z.strictObject({
  field: z.string().min(1),
  value: z.union([z.string(), z.array(z.string())]),
  condition: z.string(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const MISSING_REASONS = ["blank", "invalid", "not_found"] as const;
export const MissingReasonSchema = z.enum(MISSING_REASONS);
export type MissingReason = z.infer<typeof MissingReasonSchema>;

/** Why a transaction could not be checked: a blank or unreadable field, or an unmatched ID. */
export const MissingFieldSchema = z.strictObject({
  field: z.string().min(1),
  reason: MissingReasonSchema,
  /** The ID that matched no employee. */
  value: z.string().optional(),
});
export type MissingField = z.infer<typeof MissingFieldSchema>;
