import { LOCALES, type Locale } from "@hrcc/shared";
import i18next, { type i18n as I18nInstance, type Resource } from "i18next";
import { initReactI18next } from "react-i18next";

export function createAppI18n(resources: Resource, initialLocale: Locale): I18nInstance {
  const i18n = i18next.createInstance();
  // Registered before init(): with inline resources init() runs synchronously
  // and fires the first languageChanged during the call.
  i18n.on("languageChanged", (lng) => {
    document.documentElement.lang = lng;
    document.documentElement.dir = i18n.dir(lng);
  });
  void i18n.use(initReactI18next).init({
    resources,
    lng: initialLocale,
    fallbackLng: "en",
    supportedLngs: [...LOCALES],
    defaultNS: "ui",
    interpolation: { escapeValue: false },
  });
  return i18n;
}
