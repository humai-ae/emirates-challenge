import type { Page } from "@playwright/test";

/**
 * Every test starts in English: a language stored in the browser wins at sign-in
 * and is saved to the profile, so this also resets profiles changed by earlier tests.
 */
export async function startInEnglish(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("e2e-initialised")) {
      localStorage.setItem("hrcc.locale", "en");
      sessionStorage.setItem("e2e-initialised", "1");
    }
  });
}

export async function signInAs(page: Page, name: string): Promise<void> {
  await page.goto("sign-in");
  await page.getByRole("button", { name: `Continue as ${name}` }).click();
}
