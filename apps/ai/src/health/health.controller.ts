import type { AiHealthResponse } from "@hrcc/shared";
import { Controller, Get, Inject } from "@nestjs/common";
import { AI_ENV, type AiEnv } from "../config/env.js";
import { providerStatus } from "./provider-status.js";

@Controller("health")
export class HealthController {
  constructor(@Inject(AI_ENV) private readonly env: AiEnv) {}

  @Get()
  check(): AiHealthResponse {
    return { status: "ok", providers: providerStatus(this.env) };
  }
}
