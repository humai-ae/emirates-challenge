import {
  type AiDraftRuleRequest,
  type AiDraftRuleResponse,
  AiDraftRuleResponseSchema,
  AiErrorBodySchema,
  AiHealthResponseSchema,
  type AiRoutingRequest,
  type AiRoutingResponse,
  AiRoutingResponseSchema,
  type AiRuleActionRequest,
  type AiRuleActionResponse,
  AiRuleActionResponseSchema,
} from "@hrcc/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import { ENV, type Env } from "../config/env.js";
import { AiFailed, AiNotConfigured } from "./ai-errors.js";

export type AiReachability = "ok" | "unreachable" | "not_configured";

@Injectable()
export class AiClient {
  constructor(@Inject(ENV) private readonly env: Env) {}

  async health(): Promise<AiReachability> {
    const { AI_SERVICE_URL: baseUrl, AI_SERVICE_TOKEN: token } = this.env;
    if (!baseUrl || !token) return "not_configured";
    try {
      const response = await fetch(new URL("/health", baseUrl), {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(2_000),
      });
      if (!response.ok) return "unreachable";
      AiHealthResponseSchema.parse(await response.json());
      return "ok";
    } catch {
      return "unreachable";
    }
  }

  draftRule(body: AiDraftRuleRequest): Promise<AiDraftRuleResponse> {
    return this.post("/v1/rules/draft", body, AiDraftRuleResponseSchema, 60_000);
  }

  ruleAction(body: AiRuleActionRequest): Promise<AiRuleActionResponse> {
    return this.post("/v1/texts/rule-action", body, AiRuleActionResponseSchema, 60_000);
  }

  proposeRouting(body: AiRoutingRequest): Promise<AiRoutingResponse> {
    return this.post("/v1/routing/propose", body, AiRoutingResponseSchema, 30_000);
  }

  /** A call to the AI service: its answer checked against the contract, or a typed failure. */
  private async post<T>(
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    timeoutMs: number,
  ): Promise<T> {
    const { AI_SERVICE_URL: baseUrl, AI_SERVICE_TOKEN: token } = this.env;
    if (!baseUrl || !token) throw new AiNotConfigured();
    const response = await fetch(new URL(path, baseUrl), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    }).catch((error: unknown) => {
      throw new AiFailed("the AI service can't be reached", { cause: error });
    });
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = AiErrorBodySchema.safeParse(json);
      if (
        response.status === 503 &&
        error.success &&
        error.data.code === "provider_not_configured"
      ) {
        throw new AiNotConfigured();
      }
      throw new AiFailed(`status ${response.status}${error.success ? ` ${error.data.code}` : ""}`);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new AiFailed("an answer that doesn't match the contract");
    return parsed.data;
  }
}
