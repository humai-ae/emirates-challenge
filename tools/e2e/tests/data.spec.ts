import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { signIn, startInEnglish, USERS } from "./helpers.js";

const fixture = (name: string) =>
  fileURLToPath(new URL(`../../sample-data/fixtures/small/${name}`, import.meta.url));

test.beforeEach(async ({ page }) => {
  await startInEnglish(page);
});

test("an admin uploads the sample pack, confirms its columns and deletes it", async ({ page }) => {
  const name = `E2E pack ${Date.now()}`;
  const nav = page.getByRole("navigation", { name: "Main" });

  await signIn(page, USERS.admin);
  await nav.getByRole("link", { name: "Data" }).click();
  await page.getByRole("button", { name: "Upload data" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Transactions file").setInputFiles(fixture("transactions.csv"));
  await page.getByLabel("Employees file").setInputFiles(fixture("employees.csv"));
  await page.getByRole("button", { name: "Upload", exact: true }).click();

  await expect(page).toHaveURL(/\/admin\/data\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  await expect(
    page.getByTestId("dataset-issue").filter({ hasText: "Unknown employee IDs in" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm columns" }).click();
  await expect(page.getByText("Columns confirmed. Checks will use these roles.")).toBeVisible();

  await nav.getByRole("link", { name: "Set up" }).click();
  const steps = page.getByTestId("setup-step");
  await expect(steps.nth(0)).toContainText("Done");
  await expect(steps.nth(0)).toContainText(name);
  await expect(steps.nth(1)).toContainText("Done");

  await nav.getByRole("link", { name: "Data" }).click();
  await page
    .getByTestId("dataset-row")
    .filter({ hasText: name })
    .getByRole("link", { name })
    .click();
  await page.getByRole("button", { name: "Delete dataset" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(`Delete ${name}?`);
  await dialog.getByRole("button", { name: "Delete dataset" }).click();
  await expect(page.getByText("This dataset was deleted.", { exact: false })).toBeVisible();
});

test("a file that isn't UTF-8 is refused with advice", async ({ page }) => {
  await signIn(page, USERS.admin);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Data" }).click();
  await page.getByRole("button", { name: "Upload data" }).click();
  await page.getByLabel("Transactions file").setInputFiles({
    name: "transactions.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("transaction_id,note\nTX-1,Café\n", "latin1"),
  });
  await page.getByLabel("Employees file").setInputFiles(fixture("employees.csv"));
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "The transactions file isn't saved as UTF-8.",
  );
});
