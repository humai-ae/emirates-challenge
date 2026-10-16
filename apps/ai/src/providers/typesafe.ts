import { TypeSafeClient } from "@typesafe-ai/sdk";
import type { AiEnv } from "../config/env.js";

export const TYPESAFE = Symbol("TYPESAFE");

/** The Jev client, or null when no key is set. */
export function typesafeClient(env: AiEnv): TypeSafeClient | null {
  if (!env.TYPESAFE_API_KEY) return null;
  return new TypeSafeClient({
    apiKey: env.TYPESAFE_API_KEY,
    defaultModel: env.TYPESAFE_MODEL,
    timeout: 30_000,
  });
}
