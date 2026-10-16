import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  db: z.enum(["ok", "down"]),
  ai: z.enum(["ok", "unreachable", "not_configured"]),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const AiHealthResponseSchema = z.object({
  status: z.literal("ok"),
  providers: z.object({
    typesafe: z.enum(["configured", "missing"]),
    /** The model that writes texts (suggested fixes). */
    textModel: z.enum(["configured", "missing"]),
  }),
});
export type AiHealthResponse = z.infer<typeof AiHealthResponseSchema>;
