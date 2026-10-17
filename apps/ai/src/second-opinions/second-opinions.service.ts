import {
  type AiSecondOpinionRequest,
  AiSecondOpinionRequestSchema,
  type AiSecondOpinionResponse,
  SECOND_OPINION_QUESTION_SET,
} from "@hrcc/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { noul, type Questions, type TypeSafeClient } from "@typesafe-ai/sdk";
import { describeError, notConfigured, providerFailed } from "../common/provider-errors.js";
import { sha256 } from "../providers/provenance.js";
import { TYPESAFE } from "../providers/typesafe.js";

type Answers = Readonly<Record<string, { type: string; noul?: number }>>;

/**
 * Jev's second opinion: per transaction, whether it breaks each of its rules as the policy writes
 * them, and whether there's enough to judge. One request for a batch; `api` applies the thresholds.
 */
@Injectable()
export class SecondOpinionsService {
  private readonly logger = new Logger(SecondOpinionsService.name);

  constructor(@Inject(TYPESAFE) private readonly client: TypeSafeClient | null) {}

  async evaluate(input: AiSecondOpinionRequest): Promise<AiSecondOpinionResponse> {
    if (!this.client) throw notConfigured("typesafe");
    const request = AiSecondOpinionRequestSchema.parse(input);
    const questions: Questions = {};
    request.transactions.forEach((transaction, t) => {
      for (const r of transaction.rules) {
        questions[`t${t}_r${r}`] = noul(
          `Does \`transactions[${t}]\` break the rule \`${request.rules[r]?.id}\` in \`rules\` as the policy writes it? Judge only from its fields and gaps.`,
        );
      }
      questions[`t${t}_enough`] = noul(
        `Is there enough information in \`transactions[${t}]\` to judge the rules it lists?`,
      );
    });
    const state = {
      rules: request.rules,
      transactions: request.transactions.map((transaction) => ({
        rules: transaction.rules.map((r) => request.rules[r]?.id ?? ""),
        fields: Object.fromEntries(transaction.fields.map((field) => [field.name, field.value])),
        gaps: Object.fromEntries(transaction.gaps.map((gap) => [gap.name, gap.days])),
      })),
    };
    const started = Date.now();
    const result = await this.client.systemOne({ state, questions }).catch((error: unknown) => {
      this.logger.warn(`Jev failed: ${describeError(error)}`);
      throw providerFailed("typesafe", "request_failed");
    });
    const answers = result.answers as Answers;
    const probability = (id: string): number => {
      const answer = answers[id];
      if (answer?.type !== "noul" || typeof answer.noul !== "number") {
        throw providerFailed("typesafe", "unexpected_answer");
      }
      return answer.noul;
    };
    try {
      return {
        answers: request.transactions.flatMap((transaction, t) =>
          transaction.rules.map((r) => ({
            key: transaction.key,
            rule: request.rules[r]?.id ?? "",
            pBreak: probability(`t${t}_r${r}`),
          })),
        ),
        enough: request.transactions.map((transaction, t) => ({
          key: transaction.key,
          p: probability(`t${t}_enough`),
        })),
        provenance: {
          provider: "typesafe",
          model: result.model,
          version: SECOND_OPINION_QUESTION_SET,
          inputSha256: sha256(request),
          latencyMs: Date.now() - started,
        },
      };
    } catch (error) {
      this.logger.warn(`Jev answered unexpectedly: ${describeError(error)}`);
      throw error;
    }
  }
}
