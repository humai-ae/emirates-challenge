import { ApiError } from "@hrcc/shared";

type Translate = (key: string, options?: Record<string, unknown>) => string;

const KEY = /^[a-z_]+$/;

/** The first error of a form field, translated. Shared schemas use `validation.*` keys as messages. */
export function fieldError(errors: ReadonlyArray<unknown>, t: Translate): string | undefined {
  const first = errors.find((error) => error !== undefined && error !== null && error !== false);
  if (first === undefined) return undefined;
  const message = typeof first === "string" ? first : (first as { message?: unknown }).message;
  return typeof message === "string" && KEY.test(message)
    ? t(`validation.${message}`, { defaultValue: t("validation.invalid") })
    : t("validation.invalid");
}

/** An API failure as a sentence; unknown codes and network failures get the general message. */
export function apiErrorMessage(error: unknown, t: Translate): string {
  if (error instanceof ApiError) {
    return t(`errors.${error.body.code}`, { defaultValue: t("errors.generic") });
  }
  return t("errors.generic");
}
