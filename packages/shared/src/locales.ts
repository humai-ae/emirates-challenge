import { z } from "zod";

export const LOCALES = ["en", "ar"] as const;
export const LocaleSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof LocaleSchema>;
export const DEFAULT_LOCALE: Locale = "en";

export function directionOf(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}
