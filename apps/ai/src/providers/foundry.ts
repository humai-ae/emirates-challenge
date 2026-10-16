import { AnthropicFoundry } from "@anthropic-ai/foundry-sdk";
import type { AiEnv } from "../config/env.js";

export const FOUNDRY = Symbol("FOUNDRY");

/**
 * The Claude client on Microsoft Foundry, or null when it isn't set up. The base URL wins over the
 * resource name; an empty `resource` stops the SDK reading ANTHROPIC_FOUNDRY_RESOURCE from the
 * environment, which it refuses beside a base URL.
 */
export function foundryClient(env: AiEnv): AnthropicFoundry | null {
  const resource = env.ANTHROPIC_FOUNDRY_RESOURCE;
  const baseURL =
    env.ANTHROPIC_FOUNDRY_BASE_URL ??
    (resource ? `https://${resource}.services.ai.azure.com/anthropic/` : undefined);
  if (!env.ANTHROPIC_FOUNDRY_API_KEY || !baseURL) return null;
  return new AnthropicFoundry({
    apiKey: env.ANTHROPIC_FOUNDRY_API_KEY,
    baseURL,
    resource: "",
    maxRetries: 2,
    timeout: 30_000,
  });
}
