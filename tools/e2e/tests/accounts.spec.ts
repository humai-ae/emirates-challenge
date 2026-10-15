import { expect, test } from "@playwright/test";
import { signIn, startInEnglish, USERS } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await startInEnglish(page);
});

test("an admin adds a user, who must choose a password and can then be deactivated", async ({
  page,
}) => {
  const email = `e2e.${Date.now()}@emirates.test`;
  const temporary = "temporary-pass-1";
  const chosen = "my-own-password-1";
  const nav = page.getByRole("navigation", { name: "Main" });

  await signIn(page, USERS.admin);
  await nav.getByRole("link", { name: "Users" }).click();
  await page.getByRole("button", { name: "Add user" }).click();
  await page.getByLabel("Full name").fill("E2E Person");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Role").selectOption("analyst");
  await page.getByLabel("Temporary password").fill(temporary);
  await page.getByRole("button", { name: "Add user" }).click();
  await expect(
    page.getByText(`${email} can now sign in with the temporary password.`),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();

  await signIn(page, email, temporary);
  await expect(page).toHaveURL(/\/account\/password$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Choose a new password");
  await page.goto("analyst/inbox");
  await expect(page).toHaveURL(/\/account\/password$/);
  await page.getByLabel("Current password").fill(temporary);
  await page.getByLabel("New password", { exact: true }).fill(chosen);
  await page.getByLabel("Confirm new password").fill(chosen);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole("button", { name: "Sign out" }).click();

  await signIn(page, USERS.admin);
  await nav.getByRole("link", { name: "Users" }).click();
  const row = page.getByTestId("user-row").filter({ hasText: email });
  await row.getByRole("button", { name: "Deactivate" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Deactivate" }).click();
  await expect(row).toContainText("Deactivated");
  await page.getByRole("button", { name: "Sign out" }).click();

  await signIn(page, email, chosen);
  await expect(page.getByRole("alert")).toHaveText(
    "That email and password don't match an active account.",
  );
});
