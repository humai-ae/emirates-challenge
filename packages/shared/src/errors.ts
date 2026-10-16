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
  "file_missing",
  "file_unreadable",
  "file_type_not_allowed",
  "file_too_large",
  "dataset_deleted",
  "unknown_column",
  "storage_unavailable",
  "no_dataset",
  "rule_changed",
  "rule_not_open",
  "rule_not_active",
  "rule_draft_open",
  "check_invalid",
  "no_live_rules",
  "run_in_progress",
  "ai_not_set_up",
  "nothing_to_retry",
  "no_finding_format",
  "team_name_taken",
  "routing_type_unknown",
  "flag_changed",
  "flag_owner_required",
  "flag_change_reason_required",
  "dismiss_reason_not_allowed",
  "assignee_not_in_team",
  "fix_check_own_fix",
  "internal_error",
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorBodySchema = z.object({
  code: ErrorCodeSchema,
  params: z.record(z.string(), z.unknown()).default({}),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
