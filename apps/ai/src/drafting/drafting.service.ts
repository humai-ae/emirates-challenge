import type { AiDraftRuleRequest, AiDraftRuleResponse } from "@hrcc/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { TypeSafeClient } from "@typesafe-ai/sdk";
import { describeError, notConfigured, providerFailed } from "../common/provider-errors.js";
import { sha256 } from "../providers/provenance.js";
import { TYPESAFE } from "../providers/typesafe.js";
import { draftQuestions, QUESTION_SET, readDraftAnswers } from "./questions.js";

/** One Jev request per rule: typed decisions that code turns into a check. */
@Injectable()
export class DraftingService {
  private readonly logger = new Logger(DraftingService.name);

  constructor(@Inject(TYPESAFE) private readonly client: TypeSafeClient | null) {}

  async draft(request: AiDraftRuleRequest): Promise<AiDraftRuleResponse> {
    if (!this.client) throw notConfigured("typesafe");
    const asked = draftQuestions(request);
    const started = Date.now();
    const result = await this.client
      .systemOne({ state: asked.state, questions: asked.questions })
      .catch((error: unknown) => {
        this.logger.warn(`Jev failed: ${describeError(error)}`);
        throw providerFailed("typesafe", "request_failed");
      });
    let decisions: ReturnType<typeof readDraftAnswers>;
    try {
      decisions = readDraftAnswers(request, asked, result.answers);
    } catch (error) {
      this.logger.warn(`Jev answered unexpectedly: ${describeError(error)}`);
      throw providerFailed("typesafe", "unexpected_answer");
    }
    return {
      ...decisions,
      provenance: {
        provider: "typesafe",
        model: result.model,
        version: QUESTION_SET,
        inputSha256: sha256(request),
        latencyMs: Date.now() - started,
      },
    };
  }
}
