import { ApiError } from "@hrcc/shared";
import { apiErrorMessage } from "@hrcc/ui";

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Failures that concern one file say which file, and what to do about it. */
export function uploadErrorMessage(error: unknown, t: Translate, tUi: Translate): string {
  if (error instanceof ApiError) {
    const { code, params } = error.body;
    const file = t(
      params.file === "employees" ? "data.files.employees" : "data.files.transactions",
    );
    if (code === "file_unreadable") {
      const reason =
        params.reason === "not_utf8" || params.reason === "empty" ? params.reason : "malformed";
      return t(`data.unreadable.${reason}`, { file });
    }
    if (code === "file_type_not_allowed") return t("data.wrongType", { file });
  }
  return apiErrorMessage(error, tUi);
}
