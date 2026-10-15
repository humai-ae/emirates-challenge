import { createAppI18n, initialLocale, uiAr, uiEn } from "@hrcc/ui/app";
import { webAr } from "./locales/web-ar";
import { webEn } from "./locales/web-en";

export const resources = {
  en: { ui: uiEn, web: webEn },
  ar: { ui: uiAr, web: webAr },
};

export const i18n = createAppI18n(resources, initialLocale());
