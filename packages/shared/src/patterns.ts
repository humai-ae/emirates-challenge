import { z } from "zod";
import { AiProvenanceSchema, ProbabilitySchema } from "./ai.js";

/** What code looks for over a whole dataset: activity that is unusual, though no rule is broken. */
export const PATTERN_DETECTORS = [
  "just_under_limit",
  "dominant_pair",
  "off_hours_approvals",
  "backdating",
  "rare_type",
  "split_requests",
] as const;
export const PatternDetectorSchema = z.enum(PATTERN_DETECTORS);
export type PatternDetector = z.infer<typeof PatternDetectorSchema>;

/** The code a pattern's flag carries where a rule's ID would be: stable, and unlike a policy's. */
export const PATTERN_CODES: Readonly<Record<PatternDetector, string>> = {
  just_under_limit: "PAT-1",
  dominant_pair: "PAT-2",
  off_hours_approvals: "PAT-3",
  backdating: "PAT-4",
  rare_type: "PAT-5",
  split_requests: "PAT-6",
};

/** The detector a code stands for; null for a rule's ID. */
export function detectorOfCode(code: string): PatternDetector | null {
  return PATTERN_DETECTORS.find((detector) => PATTERN_CODES[detector] === code) ?? null;
}

/** At most this many pattern flags per run, and per detector, so one kind can't take every slot. */
export const PATTERN_FLAG_LIMIT = 20;
export const PATTERN_PER_DETECTOR_FLAGS = 8;
/** At most this many candidates go to Jev, and per detector. */
export const PATTERN_CANDIDATES_FOR_AI = 60;
export const PATTERN_PER_DETECTOR_CANDIDATES = 15;
/** Candidates per ranking request. */
export const PATTERN_RANK_BATCH = 20;
/** The ranking question's version. */
export const PATTERN_QUESTION_SET = "patterns-v1";

/** One aggregate fact about a pattern: a count, a rate, a limit, or who or what it is about. */
export const PatternFactSchema = z.object({
  key: z.string().min(1).max(40),
  value: z.union([z.string().max(200), z.number()]),
});
export type PatternFact = z.infer<typeof PatternFactSchema>;

/** A pattern as its flag keeps it: what code found, how strong, and how concerning Jev found it. */
export const FlagPatternSchema = z.object({
  detector: PatternDetectorSchema,
  /** Who or what the pattern is about: the same in a later run means the same pattern. */
  subject: z.string().min(1).max(200),
  /** Code's statistical score, 0 to 1. */
  strength: ProbabilitySchema,
  /** Jev's, 0 (benign) to 1 (likely control issue); null when code ranked it alone. */
  concern: ProbabilitySchema.nullable(),
  combined: ProbabilitySchema,
  facts: z.array(PatternFactSchema).max(12),
  /** The transactions it rests on, most telling first. */
  transactions: z
    .array(z.object({ id: z.string().nullable(), rowNo: z.number().int().positive() }))
    .max(20),
});
export type FlagPattern = z.infer<typeof FlagPatternSchema>;

/** What Jev reads to rank patterns: each candidate's description and aggregate facts, no rows. */
export const AiRankPatternsRequestSchema = z.strictObject({
  candidates: z
    .array(
      z.strictObject({
        key: z.string().min(1).max(100),
        detector: PatternDetectorSchema,
        description: z.string().min(1).max(400),
        facts: z.array(PatternFactSchema).max(12),
      }),
    )
    .min(1)
    .max(PATTERN_RANK_BATCH),
});
export type AiRankPatternsRequest = z.infer<typeof AiRankPatternsRequestSchema>;

export const AiRankPatternsResponseSchema = z.object({
  ranks: z.array(
    z.object({
      key: z.string(),
      /** Jev's expected level, 0 (benign) to 1 (likely control issue). */
      concern: ProbabilitySchema,
      probabilities: z.object({
        benign: ProbabilitySchema,
        worth_a_look: ProbabilitySchema,
        likely_issue: ProbabilitySchema,
      }),
    }),
  ),
  provenance: AiProvenanceSchema,
});
export type AiRankPatternsResponse = z.infer<typeof AiRankPatternsResponseSchema>;
