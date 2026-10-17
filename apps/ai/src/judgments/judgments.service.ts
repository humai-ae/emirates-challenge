import {
  type AiJudgeRequestInput,
  AiJudgeRequestSchema,
  type AiJudgeResponse,
  JUDGMENT_QUESTION_SET,
} from "@hrcc/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { TypeSafeClient } from "@typesafe-ai/sdk";
import { describeError, notConfigured, providerFailed } from "../common/provider-errors.js";
import { sha256 } from "../providers/provenance.js";
import { TYPESAFE } from "../providers/typesafe.js";
import { judgmentQuestions, readJudgments } from "./questions.js";

/** One Jev request per batch of texts: the probabilities only; `api` applies the thresholds. */
@Injectable()
export class JudgmentsService {
  private readonly logger = new Logger(JudgmentsService.name);

  constructor(@Inject(TYPESAFE) private readonly client: TypeSafeClient | null) {}

  async evaluate(input: AiJudgeRequestInput): Promise<AiJudgeResponse> {
    if (!this.client) throw notConfigured("typesafe");
    const request = AiJudgeRequestSchema.parse(input);
    const asked = judgmentQuestions(request);
    const started = Date.now();
    const result = await this.client.systemOne(asked).catch((error: unknown) => {
      this.logger.warn(`Jev failed: ${describeError(error)}`);
      throw providerFailed("typesafe", "request_failed");
    });
    let answers: AiJudgeResponse["answers"];
    try {
      answers = readJudgments(request, result.answers);
    } catch (error) {
      this.logger.warn(`Jev answered unexpectedly: ${describeError(error)}`);
      throw providerFailed("typesafe", "unexpected_answer");
    }
    return {
      answers,
      provenance: {
        provider: "typesafe",
        model: result.model,
        version: JUDGMENT_QUESTION_SET,
        inputSha256: sha256(request),
        latencyMs: Date.now() - started,
      },
    };
  }
}
