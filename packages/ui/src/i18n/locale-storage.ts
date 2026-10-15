import { DEFAULT_LOCALE, type Locale, LocaleSchema } from "@hrcc/shared";

export const LOCALE_STORAGE_KEY = "hrcc.locale";

export function readStoredLocale(): Locale | null {
  const parsed = LocaleSchema.safeParse(globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY));
  return parsed.success ? parsed.data : null;
}

export function storeLocale(locale: Locale): void {
  globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
}

export function initialLocale(): Locale {
  return readStoredLocale() ?? DEFAULT_LOCALE;
}
