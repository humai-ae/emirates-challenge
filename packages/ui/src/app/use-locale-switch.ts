import { DEFAULT_LOCALE, type Locale, LocaleSchema } from "@hrcc/shared";
import { useTranslation } from "react-i18next";
import { storeLocale } from "../i18n/locale-storage";

/**
 * Switches the UI language, remembers the explicit choice in this browser,
 * and optionally saves it to the signed-in user's profile.
 */
export function useLocaleSwitch(persist?: (locale: Locale) => Promise<unknown>) {
  const { i18n } = useTranslation();
  const locale = LocaleSchema.catch(DEFAULT_LOCALE).parse(i18n.resolvedLanguage);
  async function setLocale(next: Locale): Promise<void> {
    storeLocale(next);
    await i18n.changeLanguage(next);
    await persist?.(next);
  }
  return { locale, setLocale };
}
