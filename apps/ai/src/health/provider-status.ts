import type { AiHealthResponse } from "@hrcc/shared";
import type { AiEnv } from "../config/env.js";

export function providerStatus(env: AiEnv): AiHealthResponse["providers"] {
  return {
    typesafe: env.TYPESAFE_API_KEY ? "configured" : "missing",
    textModel: env.TEXT_MODEL_BASE_URL && env.TEXT_MODEL_API_KEY ? "configured" : "missing",
  };
}
