import { z } from "zod";

export const ERROR_CODES = [
  "validation_failed",
  "unauthenticated",
  "forbidden",
  "csrf_missing",
  "not_found",
  "conflict",
  "demo_auth_disabled",
  "internal_error",
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorBodySchema = z.object({
  code: ErrorCodeSchema,
  params: z.record(z.string(), z.unknown()).default({}),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
