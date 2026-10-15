import { z } from "zod";

export const ERROR_CODES = [
  "validation_failed",
  "unauthenticated",
  "forbidden",
  "csrf_missing",
  "not_found",
  "conflict",
  "invalid_credentials",
  "password_auth_disabled",
  "password_change_required",
  "wrong_password",
  "password_unchanged",
  "email_taken",
  "team_not_found",
  "own_account",
  "last_admin",
  "internal_error",
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorBodySchema = z.object({
  code: ErrorCodeSchema,
  params: z.record(z.string(), z.unknown()).default({}),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
