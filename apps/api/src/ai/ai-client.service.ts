import { AiHealthResponseSchema } from "@hrcc/shared";
import { Inject, Injectable } from "@nestjs/common";
import { ENV, type Env } from "../config/env.js";

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
}
