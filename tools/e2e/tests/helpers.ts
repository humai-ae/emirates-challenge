import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";

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

/** The header every mutating API request needs. */
export const CSRF = { "x-hrcc-request": "1" };

/** A file of the small synthetic pack. */
export const fixture = (name: string) =>
  fileURLToPath(new URL(`../../sample-data/fixtures/small/${name}`, import.meta.url));

/** Approves a rule's draft through the API (the rules test covers those screens), unless it is live. */
export async function approve(page: Page, ruleId: string): Promise<void> {
  // Drafts arrive in the background: wait until this rule's is in.
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`/api/v1/rules/${ruleId}`);
        const { rule } = (await response.json()) as {
          rule: { versions: Array<{ status: string }> };
        };
        return rule.versions[0]?.status;
      },
      { timeout: 30_000 },
    )
    .not.toBe("drafting");
  const response = await page.request.get(`/api/v1/rules/${ruleId}`);
  const { rule } = (await response.json()) as {
    rule: { rowVersion: number; versions: Array<{ status: string }> };
  };
  if (rule.versions.some((version) => version.status === "active")) return;
  const approved = await page.request.post(`/api/v1/rules/${ruleId}/approve`, {
    headers: CSRF,
    data: { rowVersion: rule.rowVersion },
  });
  expect(approved.status()).toBe(200);
}
