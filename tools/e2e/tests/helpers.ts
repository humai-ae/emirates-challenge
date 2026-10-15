import type { Page } from "@playwright/test";

/** The demo accounts' password: the Compose default unless E2E_PASSWORD says otherwise. */
export const DEMO_PASSWORD = process.env.E2E_PASSWORD ?? "Emirates-Demo-2026";

export const USERS = {
  admin: "layla.haddad@emirates.test",
  analyst: "omar.siddiqui@emirates.test",
  lead: "priya.nair@emirates.test",
  auditor: "daniel.mensah@emirates.test",
} as const;

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

export async function signIn(page: Page, email: string, password = DEMO_PASSWORD): Promise<void> {
  await page.goto("sign-in");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
