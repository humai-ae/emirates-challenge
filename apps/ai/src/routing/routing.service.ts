import type { AiRoutingRequest, AiRoutingResponse } from "@hrcc/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { choice, type Questions, type TypeSafeClient } from "@typesafe-ai/sdk";
import { describeError, notConfigured, providerFailed } from "../common/provider-errors.js";
import { sha256 } from "../providers/provenance.js";
import { TYPESAFE } from "../providers/typesafe.js";

export const ROUTING_QUESTION_SET = "routing-v1";
const NONE = "none";

/** One Jev request: a Choice of owner team for each transaction type, from the teams given. */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(@Inject(TYPESAFE) private readonly client: TypeSafeClient | null) {}

  async propose(request: AiRoutingRequest): Promise<AiRoutingResponse> {
    if (!this.client) throw notConfigured("typesafe");
    const criteria = {
      ...Object.fromEntries(request.teams.map((team) => [team, null])),
      [NONE]: "None of these teams fits this kind of transaction.",
    };
    const questions: Questions = Object.fromEntries(
      request.types.map((type, index) => [
        `type_${index}`,
        choice(`Which team should own compliance issues on "${type}" transactions?`, criteria),
      ]),
    );
    const started = Date.now();
    const result = await this.client
      .systemOne({ state: { transaction_types: request.types, teams: request.teams }, questions })
      .catch((error: unknown) => {
        this.logger.warn(`Jev failed: ${describeError(error)}`);
        throw providerFailed("typesafe", "request_failed");
      });
    const owners = request.types.map((type, index) => {
      const answer = result.answers[`type_${index}`];
      if (answer?.type !== "choice") throw providerFailed("typesafe", "unexpected_answer");
      return {
        type,
        team: answer.choice === NONE ? null : answer.choice,
        probability: answer.probabilities[answer.choice] ?? answer.confidence,
      };
    });
    return {
      owners,
      provenance: {
        provider: "typesafe",
        model: result.model,
        version: ROUTING_QUESTION_SET,
        inputSha256: sha256(request),
        latencyMs: Date.now() - started,
      },
    };
  }
}
