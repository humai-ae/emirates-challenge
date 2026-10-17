import {
  type AiRankPatternsRequest,
  AiRankPatternsRequestSchema,
  type AiRankPatternsResponse,
  PATTERN_QUESTION_SET,
} from "@hrcc/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { type Questions, score, type TypeSafeClient } from "@typesafe-ai/sdk";
import { describeError, notConfigured, providerFailed } from "../common/provider-errors.js";
import { sha256 } from "../providers/provenance.js";
import { TYPESAFE } from "../providers/typesafe.js";

/** How concerning a pattern is, from 0 to 2: each level a situation Jev can recognise. */
const LEVELS = [
  "Benign: normal activity that needs no follow-up.",
  "Worth a look: unusual enough that a reviewer should check it.",
  "Likely control issue: suggests an approval or a control is being worked around.",
] as const;

const idOf = (index: number) => `c${index}`;

type Answers = Readonly<
  Record<string, { type: string; score?: number; probabilities?: Record<string, number> }>
>;

/**
 * One Score per candidate, all over the same state: each candidate's description and aggregate
 * facts, people as tokens. `api` mixes Jev's concern with code's statistical strength.
 */
@Injectable()
export class PatternsService {
  private readonly logger = new Logger(PatternsService.name);

  constructor(@Inject(TYPESAFE) private readonly client: TypeSafeClient | null) {}

  async rank(input: AiRankPatternsRequest): Promise<AiRankPatternsResponse> {
    if (!this.client) throw notConfigured("typesafe");
    const request = AiRankPatternsRequestSchema.parse(input);
    const questions: Questions = Object.fromEntries(
      request.candidates.map((_, index) => [
        idOf(index),
        score(
          `How concerning for HR compliance is \`candidates[${index}]\`, given its description and facts?`,
          LEVELS,
        ),
      ]),
    );
    const state = {
      candidates: request.candidates.map((candidate) => ({
        detector: candidate.detector,
        description: candidate.description,
        facts: Object.fromEntries(candidate.facts.map((fact) => [fact.key, fact.value])),
      })),
    };
    const started = Date.now();
    const result = await this.client.systemOne({ state, questions }).catch((error: unknown) => {
      this.logger.warn(`Jev failed: ${describeError(error)}`);
      throw providerFailed("typesafe", "request_failed");
    });
    const answers = result.answers as Answers;
    let ranks: AiRankPatternsResponse["ranks"];
    try {
      ranks = request.candidates.map((candidate, index) => {
        const answer = answers[idOf(index)];
        if (answer?.type !== "score" || typeof answer.score !== "number") {
          throw new Error(`No Score answer for ${idOf(index)}`);
        }
        const level = (value: number) => Number(answer.probabilities?.[String(value)] ?? 0);
        return {
          key: candidate.key,
          concern: Math.min(1, Math.max(0, answer.score / 2)),
          probabilities: { benign: level(0), worth_a_look: level(1), likely_issue: level(2) },
        };
      });
    } catch (error) {
      this.logger.warn(`Jev answered unexpectedly: ${describeError(error)}`);
      throw providerFailed("typesafe", "unexpected_answer");
    }
    return {
      ranks,
      provenance: {
        provider: "typesafe",
        model: result.model,
        version: PATTERN_QUESTION_SET,
        inputSha256: sha256(request),
        latencyMs: Date.now() - started,
      },
    };
  }
}
