import { expect, test } from "@playwright/test";
import { signInAs, startInEnglish } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await startInEnglish(page);
});

test("an analyst signs in, sees their shell and keeps Arabic after a reload", async ({ page }) => {
  await signInAs(page, "Omar Siddiqui");
  await expect(page).toHaveURL(/\/analyst\/report$/);
  await expect(page.getByTestId("synthetic-banner")).toHaveText("Synthetic data only");
  await expect(page.getByRole("link", { name: "Exceptions inbox" })).toBeVisible();

  await page.getByRole("radio", { name: "العربية" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("link", { name: "صندوق الاستثناءات" })).toBeVisible();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");

  await page.getByRole("radio", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

test("an admin lands in the console and verifies the audit log", async ({ page }) => {
  await signInAs(page, "Layla Haddad");
  await expect(page).toHaveURL(/\/admin\/setup$/);
  await page.getByRole("link", { name: "Audit log" }).click();
  await expect(page).toHaveURL(/\/admin\/audit$/);
  // The newest sign-in must be this one. (The newest row overall can be a language reset:
  // signing in saves the browser's language when the profile differs.)
  await expect(
    page.getByTestId("audit-row").filter({ hasText: "signed in" }).first(),
  ).toContainText("Layla Haddad");
  await page.getByRole("button", { name: "Check nothing has been changed" }).click();
  await expect(page.getByRole("status")).toContainText("entries are intact");
});

test("an auditor reads the audit log", async ({ page }) => {
  await signInAs(page, "Daniel Mensah");
  await expect(page).toHaveURL(/\/audit\/overview$/);
  await page.getByRole("link", { name: "Audit log" }).click();
  await expect(page.getByTestId("audit-row").first()).toBeVisible();
});

test("an analyst is kept out of the auditor and admin pages", async ({ page }) => {
  await signInAs(page, "Omar Siddiqui");
  await expect(page).toHaveURL(/\/analyst\/report$/);
  await page.goto("audit/log");
  await expect(page).toHaveURL(/\/analyst\/report$/);
  await page.goto("admin/audit");
  await expect(page).toHaveURL(/\/analyst\/report$/);
});

test("switching role signs out and returns to the sign-in page", async ({ page }) => {
  await signInAs(page, "Priya Nair");
  await expect(page).toHaveURL(/\/lead\/queue$/);
  await expect(page.getByTestId("who")).toContainText("Payroll & Compensation");
  await page.getByRole("button", { name: "Switch role" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("lead/queue");
  await expect(page).toHaveURL(/\/sign-in$/);
});
