import { z } from "zod";

const emptyAsUndefined = (value: unknown) => (value === "" ? undefined : value);

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(["disable", "require", "verify"]).default("disable"),
  DATABASE_SSL_CA: z.preprocess(emptyAsUndefined, z.string().optional()),
  AUTH_MODE: z.enum(["password", "oidc"]).default("password"),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  AI_SERVICE_URL: z.preprocess(emptyAsUndefined, z.url().optional()),
  AI_SERVICE_TOKEN: z.preprocess(emptyAsUndefined, z.string().min(16).optional()),
  SUPABASE_URL: z.preprocess(emptyAsUndefined, z.url().optional()),
  SUPABASE_SECRET_KEY: z.preprocess(emptyAsUndefined, z.string().min(20).optional()),
  SUPABASE_STORAGE_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9._-]{1,62}$/)
    .default("datasets"),
});

export type Env = z.infer<typeof EnvSchema>;

export const ENV = Symbol("ENV");

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
