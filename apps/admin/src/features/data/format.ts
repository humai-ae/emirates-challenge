import type { Locale } from "@hrcc/shared";

/** Arabic text keeps Latin digits, as everywhere in the product. */
const localeTag = (locale: Locale) => (locale === "ar" ? "ar-AE-u-nu-latn" : "en-GB");

export function formatCount(value: number, locale: Locale): string {
  return new Intl.NumberFormat(localeTag(locale)).format(value);
}

/** A calendar date (`YYYY-MM-DD`), shown without any time-zone shift. */
export function formatDay(day: string, locale: Locale): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

export function formatPeriod(from: string | null, to: string | null, locale: Locale): string {
  return from && to ? `${formatDay(from, locale)} – ${formatDay(to, locale)}` : "—";
}

/** A moment in time, in Dubai. */
export function formatMoment(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dubai",
  }).format(new Date(iso));
}

export function formatSize(bytes: number, locale: Locale): string {
  const large = bytes >= 1_000_000;
  return new Intl.NumberFormat(localeTag(locale), {
    style: "unit",
    unit: large ? "megabyte" : "kilobyte",
    maximumFractionDigits: 1,
  }).format(bytes / (large ? 1_000_000 : 1_000));
}
