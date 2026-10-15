import { z } from "zod";

const emptyAsUndefined = (value: unknown) => (value === "" ? undefined : value);

export const AiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3100),
  AI_SERVICE_TOKEN: z.string().min(16),
  TYPESAFE_API_KEY: z.preprocess(emptyAsUndefined, z.string().optional()),
  TYPESAFE_MODEL: z.string().default("jev-1.13.0"),
  ANTHROPIC_FOUNDRY_RESOURCE: z.preprocess(emptyAsUndefined, z.string().optional()),
  ANTHROPIC_FOUNDRY_BASE_URL: z.preprocess(emptyAsUndefined, z.url().optional()),
  ANTHROPIC_FOUNDRY_API_KEY: z.preprocess(emptyAsUndefined, z.string().optional()),
  FOUNDRY_HAIKU_DEPLOYMENT: z.string().default("claude-haiku-5-5"),
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
