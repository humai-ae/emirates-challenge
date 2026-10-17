import { z } from "zod";
import { APPROVER_CHOICES, COMPARISON_OPERATORS, REACH_CHOICES, SeveritySchema } from "./checks.js";
import { type ColumnType, ColumnTypeSchema } from "./datasets.js";

/** Column types a rule's number can come from, and its written reason; any column can be required. */
export const NUMBER_COLUMN_TYPES: readonly ColumnType[] = ["integer", "number"];
export const TEXT_COLUMN_TYPES: readonly ColumnType[] = ["text"];
/**
 * A column a rule's written reason can come from: typed as text, or given the text role. Repeated
 * reasons are profiled as a category, but the admin's role still says what the column holds.
 */
export const isTextColumn = (column: { type: ColumnType; role?: string | null }): boolean =>
  TEXT_COLUMN_TYPES.includes(column.type) || column.role === "text";

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
  provider: z.enum(["typesafe", "text_model"]),
  model: z.string(),
  /** The question set or prompt version. */
  version: z.string(),
  inputSha256: z.string().regex(/^[0-9a-f]{64}$/),
  latencyMs: z.number().int().min(0),
});
export type AiProvenance = z.infer<typeof AiProvenanceSchema>;

export const ProbabilitySchema = z.number().min(0).max(1);

/** A value AI picked from those offered; null when it answered that the rule doesn't state one. */
function selection<T extends z.ZodType>(value: T) {
  return z.object({ value: value.nullable(), probability: ProbabilitySchema });
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
  presets: z.tuple([
    z.record(z.string(), ProbabilitySchema),
    z.record(z.string(), ProbabilitySchema),
  ]),
  amount: selection(z.number()),
  grade: selection(z.number().int()),
  days: selection(z.number().int()),
  count: selection(z.number().int()),
  operator: selection(z.enum(COMPARISON_OPERATORS)),
  per: selection(z.enum(["employee", "requester"])),
  /** For a reporting-line rule: the approver it is about, and how far up the line counts. */
  approver: selection(z.enum(APPROVER_CHOICES)),
  reach: selection(z.enum(REACH_CHOICES)),
  numberField: selection(z.string()),
  textField: selection(z.string()),
  anyField: selection(z.string()),
  /** That the rule applies to every transaction type. */
  everyType: ProbabilitySchema,
  /** That only transactions with the same amount count as duplicates. */
  sameAmount: ProbabilitySchema,
  /** That the employee a transaction is about must not request it either. */
  requesterToo: ProbabilitySchema,
  /** Per transaction type, that the rule applies to it. */
  types: z.record(z.string(), ProbabilitySchema),
  /** Per document, that the rule requires it. */
  documents: z.record(z.string(), ProbabilitySchema),
  severity: z.object({ value: SeveritySchema, probability: ProbabilitySchema }),
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
    z.object({ type: z.string(), team: z.string().nullable(), probability: ProbabilitySchema }),
  ),
  provenance: AiProvenanceSchema,
});
export type AiRoutingResponse = z.infer<typeof AiRoutingResponseSchema>;

/** Texts per judgment request: Jev answers four questions about each, all in one call. */
export const JUDGE_BATCH_SIZE = 20;
/** The judgment questions' version: part of each cached answer's key, so new questions ask again. */
export const JUDGMENT_QUESTION_SET = "judgment-v2";

/** Items per list of what counts, and characters per item. */
export const CRITERIA_MAX_ITEMS = 10;
export const CRITERION_MAX_LENGTH = 300;
const CriterionList = z
  .array(z.string().trim().min(1).max(CRITERION_MAX_LENGTH))
  .max(CRITERIA_MAX_ITEMS);

/** What counts for a vague judgment rule, as its admin wrote it: used for every text of the rule. */
export const JudgmentCriteriaSchema = z.object({
  meets: CriterionList,
  doesNotMeet: CriterionList,
});
export type JudgmentCriteria = z.infer<typeof JudgmentCriteriaSchema>;

/** The kinds of reason the text model can name when it restates a text. */
export const RESTATEMENT_KINDS = [
  "performance",
  "promotion",
  "market_pay",
  "cost_of_living",
  "retention",
  "added_duties",
  "relocation",
  "pay_equity",
  "correction",
  "temporary_cover",
  "qualification",
  "organisation_change",
  "none",
  "unclear",
] as const;
export const RestatementKindSchema = z.enum(RESTATEMENT_KINDS);
export type RestatementKind = z.infer<typeof RestatementKindSchema>;
/** A kind that names a reason: only these get one more Jev answer. */
export const CONCRETE_KINDS: readonly RestatementKind[] = RESTATEMENT_KINDS.filter(
  (kind) => kind !== "none" && kind !== "unclear",
);

/** A text restated in plain words by the text model, and the kind of reason it names. */
/**
 * A text's restatement as kept and shown: people's IDs put back can make it longer than the 400
 * characters the text model may write.
 */
export const RestatementSchema = z.object({
  restated: z.string(),
  kind: RestatementKindSchema,
});
export type Restatement = z.infer<typeof RestatementSchema>;

/** Everything AI may see to judge texts against a rule: the rule, each text and its context. */
export const AiJudgeRequestSchema = z.strictObject({
  rule: z.strictObject({
    id: z.string().min(1).max(32),
    /** The rule as the policy wrote it: what a text must meet. */
    text: z.string().min(1).max(4000),
    /** What counts, when the admin wrote it. */
    criteria: z
      .strictObject({ meets: CriterionList, doesNotMeet: CriterionList })
      .nullable()
      .default(null),
  }),
  items: z
    .array(
      z.strictObject({
        /** Code's reference for the answer; never sent to Jev. */
        key: z.string().min(1).max(100),
        field: z.string().min(1).max(128),
        text: z.string().min(1).max(2000),
        type: z.string().min(1).max(64).nullable(),
        /** The amount as a range worked out in code, such as "5,000 to 10,000". */
        amountBand: z.string().min(1).max(40).nullable(),
        /** The text model's restatement, when Jev is asked a second time. */
        clarification: z
          .strictObject({ restated: z.string().min(1).max(400), kind: RestatementKindSchema })
          .nullable()
          .default(null),
      }),
    )
    .min(1)
    .max(JUDGE_BATCH_SIZE),
});
export type AiJudgeRequest = z.infer<typeof AiJudgeRequestSchema>;
export type AiJudgeRequestInput = z.input<typeof AiJudgeRequestSchema>;

/** Texts Jev was unsure about, for the text model to restate once. */
export const AiRestateRequestSchema = z.strictObject({
  rule: z.strictObject({ id: z.string().min(1).max(32), text: z.string().min(1).max(4000) }),
  items: z
    .array(
      z.strictObject({
        key: z.string().min(1).max(100),
        field: z.string().min(1).max(128),
        text: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(JUDGE_BATCH_SIZE),
});
export type AiRestateRequest = z.infer<typeof AiRestateRequestSchema>;

export const AiRestateResponseSchema = z.object({
  /** Each text's restatement; kind "unclear" with an empty restatement when it couldn't be used. */
  items: z.array(RestatementSchema.extend({ key: z.string(), restated: z.string().max(400) })),
  provenance: AiProvenanceSchema,
});
export type AiRestateResponse = z.infer<typeof AiRestateResponseSchema>;

/** Jev's four answers about one text, each the probability of yes. */
export const JudgmentAnswersSchema = z.object({
  /** It gives a specific business reason. */
  specific: ProbabilitySchema,
  /** It is a generic placeholder, such as "as discussed". */
  placeholder: ProbabilitySchema,
  /** A reviewer would accept it as meeting the rule. */
  accept: ProbabilitySchema,
  /** There is enough information to judge it. */
  enough: ProbabilitySchema,
});
export type JudgmentAnswers = z.infer<typeof JudgmentAnswersSchema>;

export const AiJudgeResponseSchema = z.object({
  answers: z.array(JudgmentAnswersSchema.extend({ key: z.string() })),
  provenance: AiProvenanceSchema,
});
export type AiJudgeResponse = z.infer<typeof AiJudgeResponseSchema>;

/** An explanation is read at a glance; a fix is as long as a rule's suggested action. */
export const EXPLANATION_MAX_WORDS = 60;
export const FIX_MAX_LENGTH = 300;
/** How a person's ID reaches AI: "[EMP_1]". */
export const PSEUDONYM_PATTERN = /^\[EMP_\d{1,3}\]$/;

const AiEvidenceSchema = z.strictObject({
  field: z.string().min(1).max(128),
  value: z.union([z.string().max(500), z.array(z.string().max(100)).max(50)]),
  condition: z.string().max(300),
});
const BothLanguages = z.strictObject({
  en: z.string().min(1).max(1000),
  ar: z.string().min(1).max(1000),
});

/** Everything AI may see to explain a flag: its evidence and the rule, people as tokens. */
export const AiExplainRequestSchema = z.strictObject({
  kind: z.enum(["rule_break", "ai_judgment"]),
  rule: z.strictObject({
    id: z.string().min(1).max(32),
    title: z.string().min(1).max(200),
    text: z.string().min(1).max(4000),
  }),
  transactionId: z.string().min(1).max(64).nullable(),
  evidence: z.array(AiEvidenceSchema).max(30),
  severity: SeveritySchema,
  team: z.string().min(1).max(80).nullable(),
  /** The rule's approved suggested action: what the fix is based on. */
  action: BothLanguages,
  /** The flag's standard wording, for reference. */
  standard: BothLanguages,
  /** For an AI judgment: what AI decided, and how likely (0 to 100) the text breaks the rule. */
  judgment: z
    .strictObject({
      decision: z.enum(["breaks", "unsure"]),
      likelihood: z.number().int().min(0).max(100),
    })
    .nullable(),
  /** The tokens standing for people in the evidence: the only people a text may name. */
  people: z.array(z.string().regex(PSEUDONYM_PATTERN)).max(20),
});
export type AiExplainRequest = z.infer<typeof AiExplainRequestSchema>;

export const AiWrittenSchema = z.object({
  explanation: z.string().min(1),
  fix: z.string().min(1),
});
export type AiWritten = z.infer<typeof AiWrittenSchema>;

export const AiExplainResponseSchema = z.object({
  /** Null: no text in that language passed the checks, so the standard wording stays. */
  en: AiWrittenSchema.nullable(),
  ar: AiWrittenSchema.nullable(),
  /** Texts that failed a check, and why: kept in the audit log. A reply can be empty. */
  rejected: z.array(
    z.object({
      explanation: z.string(),
      fix: z.string(),
      attempt: z.number().int().min(1),
      language: z.enum(["en", "ar"]),
      problem: z.string(),
    }),
  ),
  /** Jev's checks of the texts used, as probabilities; null where Jev didn't check. */
  verification: z.object({
    explanation: ProbabilitySchema.nullable(),
    fix: ProbabilitySchema.nullable(),
    arabic: ProbabilitySchema.nullable(),
  }),
  provenance: AiProvenanceSchema,
});
export type AiExplainResponse = z.infer<typeof AiExplainResponseSchema>;
