import { describe, expect, it } from "vitest";
import { createAppI18n } from "./create-app-i18n";
import { initialLocale, readStoredLocale, storeLocale } from "./locale-storage";
import { uiAr } from "./ui-ar";
import { uiEn } from "./ui-en";

const resources = { en: { ui: uiEn }, ar: { ui: uiAr } };

describe("createAppI18n", () => {
  it("sets lang and dir on the document for the initial locale", () => {
    const i18n = createAppI18n(resources, "ar");
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    expect(i18n.t("roles.analyst")).toBe("محلل الامتثال");
  });

  it("flips direction when the language changes", async () => {
    const i18n = createAppI18n(resources, "en");
    expect(document.documentElement.dir).toBe("ltr");
    await i18n.changeLanguage("ar");
    expect(document.documentElement.dir).toBe("rtl");
    await i18n.changeLanguage("en");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("interpolates values without escaping", () => {
    const i18n = createAppI18n(resources, "en");
    expect(i18n.t("audit.integrityOk", { count: 3 })).toBe(
      "All 3 entries are intact. Nothing has been changed or removed.",
    );
  });
});

describe("locale storage", () => {
  it("returns null when nothing valid is stored", () => {
    expect(readStoredLocale()).toBeNull();
    localStorage.setItem("hrcc.locale", "fr");
    expect(readStoredLocale()).toBeNull();
    expect(initialLocale()).toBe("en");
  });

  it("round-trips a stored locale", () => {
    storeLocale("ar");
    expect(readStoredLocale()).toBe("ar");
    expect(initialLocale()).toBe("ar");
  });
});
