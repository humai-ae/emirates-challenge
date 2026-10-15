import { expect, test } from "@playwright/test";
import { signIn, startInEnglish, USERS } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await startInEnglish(page);
});

test("an analyst signs in, lands on Home and keeps Arabic after a reload", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Main" });
  await signIn(page, USERS.analyst);
  await expect(page).toHaveURL(/\/home$/);
  await expect(nav.getByRole("link", { name: "Home", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByTestId("synthetic-banner")).toHaveText("Synthetic data only");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome, Omar Siddiqui");

  await page.getByRole("radio", { name: "العربية" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  // The navigation's own label is translated too.
  await expect(
    page
      .getByRole("navigation", { name: "القائمة الرئيسية" })
      .getByRole("link", { name: "الرئيسية", exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");

  await page.getByRole("radio", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

test("a wrong password keeps you on the sign-in page with an explanation", async ({ page }) => {
  await signIn(page, USERS.analyst, "not-the-password");
  await expect(page.getByRole("alert")).toHaveText(
    "That email and password don't match an active account.",
  );
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("an admin lands on the console Home and verifies the audit log", async ({ page }) => {
  await signIn(page, USERS.admin);
  await expect(page).toHaveURL(/\/admin\/home$/);
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Audit log" })
    .click();
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
  await signIn(page, USERS.auditor);
  await expect(page).toHaveURL(/\/home$/);
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Audit log" })
    .click();
  await expect(page.getByTestId("audit-row").first()).toBeVisible();
});

test("an analyst is kept out of the auditor and admin pages", async ({ page }) => {
  await signIn(page, USERS.analyst);
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("audit/log");
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("admin/audit");
  await expect(page).toHaveURL(/\/home$/);
});

test("signing out returns to the sign-in page", async ({ page }) => {
  await signIn(page, USERS.lead);
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByTestId("who")).toContainText("Payroll & Compensation");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("lead/queue");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("a missing asset is a 404, not the app shell", async ({ request }) => {
  // After a redeploy, an open tab asks for old chunk names; HTML in their place breaks the app.
  for (const path of ["assets/missing-0000.js", "admin/assets/missing-0000.js"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
    expect(response.headers()["cache-control"] ?? "", path).not.toContain("immutable");
  }
});

test("the app shell is revalidated on every load", async ({ request }) => {
  for (const path of ["", "analyst/report", "admin/", "admin/audit"]) {
    const response = await request.get(path);
    expect(response.headers()["content-type"], path).toContain("text/html");
    expect(response.headers()["cache-control"], path).toBe("no-cache");
  }
});
