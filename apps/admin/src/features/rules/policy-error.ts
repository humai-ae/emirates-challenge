import { ApiError } from "@hrcc/shared";
import { apiErrorMessage } from "@hrcc/ui";

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** File errors are about the policy document, not the data files the shared messages describe. */
export function policyErrorMessage(error: unknown, t: Translate, tUi: Translate): string {
  if (error instanceof ApiError) {
    const { code, params } = error.body;
    if (code === "file_unreadable") {
      return t(
        params.reason === "empty"
          ? "rules.uploadForm.errors.empty"
          : "rules.uploadForm.errors.not_utf8",
      );
    }
    if (code === "file_type_not_allowed") return t("rules.uploadForm.errors.not_policy");
    if (code === "file_too_large") return t("rules.uploadForm.errors.too_large");
    if (code === "file_missing") return t("rules.uploadForm.errors.file_required");
  }
  return apiErrorMessage(error, tUi);
}
