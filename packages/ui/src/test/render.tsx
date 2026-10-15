import type { Locale } from "@hrcc/shared";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nextProvider } from "react-i18next";
import { createAppI18n } from "../i18n/create-app-i18n";
import { uiAr } from "../i18n/ui-ar";
import { uiEn } from "../i18n/ui-en";

export function renderWithI18n(ui: ReactElement, locale: Locale = "en") {
  const i18n = createAppI18n({ en: { ui: uiEn }, ar: { ui: uiAr } }, locale);
  return { i18n, ...render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>) };
}
