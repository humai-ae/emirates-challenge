import {
  ApiError,
  type FlagDetail,
  type FlagStatus,
  type FlagSummary,
  type Locale,
  type Severity,
} from "@hrcc/shared";
import type { TagTone } from "@hrcc/ui";

export type Translate = (key: string, options?: Record<string, unknown>) => string;

export const SEVERITY_TONES: Record<Severity, TagTone> = {
  High: "high",
  Medium: "medium",
  Low: "low",
};

export const STATUS_TONES: Record<FlagStatus, TagTone> = {
  with_analyst: "warn",
  dismissed: "neutral",
  confirmed: "info",
  being_fixed: "info",
  fix_submitted: "ai",
  closed: "ok",
};

/** An AI judgement AI couldn't decide, even after restating the text once: a person reviews it. */
export const needsHumanReview = (flag: Pick<FlagSummary, "kind" | "confidence">) =>
  flag.kind === "ai_judgment" && flag.confidence === "Low";

const intlLocale = (locale: Locale) => (locale === "ar" ? "ar-AE-u-nu-latn" : "en-GB");

/** A calendar day (YYYY-MM-DD), as people read it. */
export function formatDay(day: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

/** A moment, in Dubai time. */
export function formatMoment(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dubai",
  }).format(new Date(iso));
}

/** A number with grouped Latin digits. */
export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

/** The flag's standard wording in a language. */
export function standardOf(
  flag: Pick<FlagDetail, "standardExplanationEn" | "standardExplanationAr">,
  locale: Locale,
): string {
  return locale === "ar" ? flag.standardExplanationAr : flag.standardExplanationEn;
}

export function explanationOf(
  flag: Pick<FlagSummary, "explanationEn" | "explanationAr">,
  locale: Locale,
): string {
  return locale === "ar" ? flag.explanationAr : flag.explanationEn;
}

/** "Already confirmed by …" when someone else acted on the flag first; null for other errors. */
export function flagConflictMessage(error: unknown, t: Translate): string | null {
  if (!(error instanceof ApiError) || error.body.code !== "flag_changed") return null;
  const status = String(error.body.params.status ?? "with_analyst");
  return t(`flags.changedBy.${status}`, {
    by: String(error.body.params.by ?? ""),
    defaultValue: t("flags.changedBy.with_analyst", { by: String(error.body.params.by ?? "") }),
  });
}
