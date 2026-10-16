import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { signIn, startInEnglish, USERS } from "./helpers.js";

const fixture = (name: string) =>
  fileURLToPath(new URL(`../../sample-data/fixtures/small/${name}`, import.meta.url));

test.beforeEach(async ({ page }) => {
  await startInEnglish(page);
});

/** Uploads the small pack as an admin and returns to the page it was on. */
async function uploadPack(page: Page, name: string) {
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Data" }).click();
  await page.getByRole("button", { name: "Upload data" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page
    .getByLabel("Data files")
    .setInputFiles([fixture("transactions.csv"), fixture("employees.csv")]);
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/data\/[0-9a-f-]{36}$/);
}

/** Deletes the pack, so no files stay in Storage (its record stays). */
async function deletePack(page: Page, name: string) {
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Data" }).click();
  await page
    .getByTestId("dataset-row")
    .filter({ hasText: name })
    .getByRole("link", { name })
    .click();
  await page.getByRole("button", { name: "Delete dataset" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete dataset" }).click();
  await expect(page.getByText("This dataset was deleted.", { exact: false })).toBeVisible();
}

test("an admin chooses the team that owns a transaction type", async ({ page }) => {
  const name = `E2E teams pack ${Date.now()}`;
  await signIn(page, USERS.admin);
  await uploadPack(page, name);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Teams" }).click();
  await page.getByLabel("Owner team for allowance_change").selectOption("Payroll & Compensation");
  await page.getByRole("button", { name: "Save owners" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Owner team for allowance_change")).toHaveValue(
    "Payroll & Compensation",
  );
  await deletePack(page, name);
});

test("an analyst asks for a rule, and the admin sees who asked", async ({ page, browser }) => {
  const name = `E2E requests pack ${Date.now()}`;
  await signIn(page, USERS.admin);
  await uploadPack(page, name);

  const analyst = await (await browser.newContext()).newPage();
  await startInEnglish(analyst);
  await signIn(analyst, USERS.analyst);
  await analyst
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Request a rule" })
    .click();
  await analyst
    .getByLabel("The rule, in plain words")
    .fill("The person who requests a transaction must not also approve it.");
  await analyst.getByRole("button", { name: "Send to the admin" }).click();
  await expect(analyst.getByText("Sent to the admin for review.")).toBeVisible();
  await expect(analyst.getByTestId("rule-request").first()).toContainText(
    "Waiting for the admin's review",
    { timeout: 30_000 },
  );

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Rules" }).click();
  await expect(
    page.getByTestId("rule-row").filter({ hasText: "Requested by Omar Siddiqui" }),
  ).toHaveCount(1);
  await deletePack(page, name);
});
