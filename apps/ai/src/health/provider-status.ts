import type { AiHealthResponse } from "@hrcc/shared";
import type { AiEnv } from "../config/env.js";

export function providerStatus(env: AiEnv): AiHealthResponse["providers"] {
  const claudeEndpoint = env.ANTHROPIC_FOUNDRY_RESOURCE ?? env.ANTHROPIC_FOUNDRY_BASE_URL;
  return {
    typesafe: env.TYPESAFE_API_KEY ? "configured" : "missing",
    claude: claudeEndpoint && env.ANTHROPIC_FOUNDRY_API_KEY ? "configured" : "missing",
  };
}
