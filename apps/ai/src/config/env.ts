import { z } from "zod";

const emptyAsUndefined = (value: unknown) => (value === "" ? undefined : value);

export const AiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3100),
  AI_SERVICE_TOKEN: z.string().min(16),
  TYPESAFE_API_KEY: z.preprocess(emptyAsUndefined, z.string().optional()),
  TYPESAFE_MODEL: z.string().default("jev-1.13.0"),
  /** The model that writes texts, as the API below names it (a Foundry deployment, say). */
  TEXT_MODEL: z.string().min(1).default("gpt-6-luna"),
  /** Any OpenAI-compatible API: a Microsoft Foundry resource's /openai/v1/, OpenAI, others. */
  TEXT_MODEL_BASE_URL: z.preprocess(emptyAsUndefined, z.url().optional()),
  TEXT_MODEL_API_KEY: z.preprocess(emptyAsUndefined, z.string().optional()),
});

export type AiEnv = z.infer<typeof AiEnvSchema>;

export const AI_ENV = Symbol("AI_ENV");

export function loadAiEnv(source: Record<string, string | undefined> = process.env): AiEnv {
  const parsed = AiEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
