import OpenAI from "openai";
import type { AiEnv } from "../config/env.js";

export const TEXT_MODEL_CLIENT = Symbol("TEXT_MODEL_CLIENT");

/** Microsoft Foundry resource hosts, whose OpenAI-compatible API lives under /openai/v1/. */
const AZURE_HOST = /\.(services\.ai|openai|cognitiveservices)\.azure\.com$/;

/** The API's base URL: as given, or a Foundry resource's address completed to its OpenAI endpoint. */
function baseUrlOf(given: string): string {
  const url = new URL(given);
  if (AZURE_HOST.test(url.hostname) && !url.pathname.includes("/openai")) {
    return `${url.origin}/openai/v1/`;
  }
  return given;
}

/**
 * The client for the model that writes texts, or null when it isn't set up. Any API that speaks
 * OpenAI's chat completions works: a Microsoft Foundry resource, OpenAI, or another provider; the
 * model is whatever TEXT_MODEL names there.
 */
export function textModelClient(env: AiEnv): OpenAI | null {
  const { TEXT_MODEL_API_KEY: apiKey, TEXT_MODEL_BASE_URL: base } = env;
  if (!apiKey || !base) return null;
  return new OpenAI({ apiKey, baseURL: baseUrlOf(base), maxRetries: 2, timeout: 60_000 });
}
