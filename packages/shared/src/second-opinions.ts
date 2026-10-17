import { z } from "zod";
import { AiProvenanceSchema, ProbabilitySchema } from "./ai.js";

/** Transactions per Jev request, transactions per background job, and opinions listed per run. */
export const SECOND_OPINION_BATCH = 10;
export const SECOND_OPINION_SLICE = 200;
export const SECOND_OPINION_LIST = 50;
/** The second-opinion questions' version. */
export const SECOND_OPINION_QUESTION_SET = "second-opinion-v1";

/** Whether a run asks Jev for a second opinion, and how far it got. */
export const SECOND_OPINION_STATES = ["off", "running", "done", "failed"] as const;
export const SecondOpinionStateSchema = z.enum(SECOND_OPINION_STATES);
export type SecondOpinionState = z.infer<typeof SecondOpinionStateSchema>;

/** What the rule's check found about a transaction Jev disagrees on. */
export const OpinionCodeSchema = z.enum(["flagged", "passed"]);
export type OpinionCode = z.infer<typeof OpinionCodeSchema>;

const OpinionFieldSchema = z.strictObject({
  name: z.string().min(1).max(128),
  value: z.union([z.string().max(300), z.array(z.string().max(100)).max(20)]),
});

/**
 * What Jev reads for a second opinion: the policy texts of the rules, and per transaction only the
 * fields its rules name, the day gaps code worked out, and people as tokens. Never whole rows.
 */
export const AiSecondOpinionRequestSchema = z.strictObject({
  rules: z
    .array(z.strictObject({ id: z.string().min(1).max(32), text: z.string().min(1).max(4000) }))
    .min(1)
    .max(20),
  transactions: z
    .array(
      z.strictObject({
        key: z.string().min(1).max(100),
        /** The rules that applied to it, by their place in `rules`. */
        rules: z.array(z.number().int().min(0)).min(1).max(20),
        fields: z.array(OpinionFieldSchema).max(40),
        gaps: z
          .array(z.strictObject({ name: z.string().min(1).max(64), days: z.number().int() }))
          .max(6),
      }),
    )
    .min(1)
    .max(SECOND_OPINION_BATCH),
});
export type AiSecondOpinionRequest = z.infer<typeof AiSecondOpinionRequestSchema>;

export const AiSecondOpinionResponseSchema = z.object({
  /** How likely each transaction breaks each of its rules as the policy writes it. */
  answers: z.array(z.object({ key: z.string(), rule: z.string(), pBreak: ProbabilitySchema })),
  /** Whether Jev had enough to judge each transaction. */
  enough: z.array(z.object({ key: z.string(), p: ProbabilitySchema })),
  provenance: AiProvenanceSchema,
});
export type AiSecondOpinionResponse = z.infer<typeof AiSecondOpinionResponseSchema>;

const ActedSchema = z.object({ by: z.string(), at: z.iso.datetime() });

/** Where Jev strongly disagrees with a rule's check: shown to people, never a finding. */
export const SecondOpinionSchema = z.object({
  id: z.uuid(),
  runId: z.string(),
  ruleId: z.string(),
  ruleVersion: z.number().int().positive(),
  ruleTitle: z.string(),
  transactionId: z.string().nullable(),
  rowNo: z.number().int().positive(),
  code: OpinionCodeSchema,
  /** How likely Jev thinks the transaction breaks the rule as the policy writes it. */
  pBreak: ProbabilitySchema,
  enough: ProbabilitySchema,
  /** How strong the disagreement is, 0 to 1. */
  strength: ProbabilitySchema,
  noted: ActedSchema.nullable(),
  reviewRequested: ActedSchema.nullable(),
  /** The flag the check raised, for a transaction it flagged. */
  flagId: z.string().nullable(),
});
export type SecondOpinion = z.infer<typeof SecondOpinionSchema>;

/** Which run's second opinions to list: the newest run's when none is named. */
export const SecondOpinionsQuerySchema = z.strictObject({
  runId: z.string().min(1).max(40).optional(),
});
export type SecondOpinionsQuery = z.infer<typeof SecondOpinionsQuerySchema>;

export const SecondOpinionsResponseSchema = z.object({
  /** The run named, or else the newest run that asked for a second opinion. */
  runId: z.string().nullable(),
  /** How far the run's second opinion got: while it is running, the list grows. */
  progress: z
    .object({
      state: SecondOpinionStateSchema,
      done: z.number().int().min(0),
      transactions: z.number().int().min(0),
    })
    .nullable(),
  /** The strongest first, at most the list's limit. */
  opinions: z.array(SecondOpinionSchema),
  /** How many the run kept. */
  total: z.number().int().min(0),
});
export type SecondOpinionsResponse = z.infer<typeof SecondOpinionsResponseSchema>;

export const SecondOpinionDetailSchema = SecondOpinionSchema.extend({
  ruleText: z.string(),
  /** The transaction's cells; empty once its dataset is deleted. */
  transaction: z.array(z.object({ column: z.string(), value: z.string() })),
});
export type SecondOpinionDetail = z.infer<typeof SecondOpinionDetailSchema>;

export const SecondOpinionResponseSchema = z.object({ opinion: SecondOpinionDetailSchema });
export type SecondOpinionResponse = z.infer<typeof SecondOpinionResponseSchema>;

/** A rule review an analyst asked for from a second opinion. */
export const ReviewRequestSchema = z.object({
  opinionId: z.uuid(),
  transactionId: z.string().nullable(),
  rowNo: z.number().int().positive(),
  code: OpinionCodeSchema,
  pBreak: ProbabilitySchema,
  by: z.string(),
  at: z.iso.datetime(),
});
export type ReviewRequest = z.infer<typeof ReviewRequestSchema>;
