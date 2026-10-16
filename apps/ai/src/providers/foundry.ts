import { AnthropicFoundry } from "@anthropic-ai/foundry-sdk";
import type { AiEnv } from "../config/env.js";

export const FOUNDRY = Symbol("FOUNDRY");

/** The resource's host: from a bare resource name, or from a URL pasted in its place. */
function resourceHost(resource: string): string {
  try {
    return new URL(resource).hostname;
  } catch {
    return `${resource}.services.ai.azure.com`;
  }
}

/**
 * The Claude client on Microsoft Foundry, or null when it isn't set up. A base URL wins when it is
 * an Anthropic endpoint; an OpenAI-style one can't serve Claude's Messages API, so the resource's
 * Anthropic endpoint is used instead when the resource is known. An empty `resource` stops the SDK
 * reading ANTHROPIC_FOUNDRY_RESOURCE from the environment, which it refuses beside a base URL.
 */
export function foundryClient(env: AiEnv): AnthropicFoundry | null {
  const {
    ANTHROPIC_FOUNDRY_API_KEY: apiKey,
    ANTHROPIC_FOUNDRY_BASE_URL: base,
    ANTHROPIC_FOUNDRY_RESOURCE: resource,
  } = env;
  const fromResource = resource ? `https://${resourceHost(resource)}/anthropic/` : undefined;
  const baseURL = base && (base.includes("/anthropic") || !fromResource) ? base : fromResource;
  if (!apiKey || !baseURL) return null;
  return new AnthropicFoundry({ apiKey, baseURL, resource: "", maxRetries: 2, timeout: 30_000 });
}
