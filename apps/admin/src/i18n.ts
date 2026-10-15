import { createAppI18n, initialLocale, uiAr, uiEn } from "@hrcc/ui/app";
import { adminAr } from "./locales/admin-ar";
import { adminEn } from "./locales/admin-en";

export const resources = {
  en: { ui: uiEn, admin: adminEn },
  ar: { ui: uiAr, admin: adminAr },
};

export const i18n = createAppI18n(resources, initialLocale());
