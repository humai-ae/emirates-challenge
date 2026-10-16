import { ApiError } from "@hrcc/shared";
import { apiErrorMessage } from "@hrcc/ui";

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** File errors are about the finding format, not the data files the shared messages describe. */
export function formatErrorMessage(error: unknown, t: Translate, tUi: Translate): string {
  if (error instanceof ApiError) {
    const { code, params } = error.body;
    if (code === "file_unreadable") {
      const reason =
        params.reason === "not_utf8" || params.reason === "empty" ? params.reason : "malformed";
      return t(`findingFormat.upload.errors.${reason}`);
    }
    if (code === "file_type_not_allowed") return t("findingFormat.upload.errors.not_csv");
    if (code === "file_too_large") return t("findingFormat.upload.errors.too_large");
    if (code === "file_missing") return t("findingFormat.upload.errors.file_required");
  }
  return apiErrorMessage(error, tUi);
}
