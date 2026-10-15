import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { signIn, startInEnglish, USERS } from "./helpers.js";

const fixture = (name: string) =>
  fileURLToPath(new URL(`../../sample-data/fixtures/small/${name}`, import.meta.url));

test.beforeEach(async ({ page }) => {
  await startInEnglish(page);
});

test("an admin uploads the policy, reviews a drafted rule and approves it", async ({ page }) => {
  const name = `E2E rules pack ${Date.now()}`;
  const nav = page.getByRole("navigation", { name: "Main" });
  await signIn(page, USERS.admin);

  // Rules are matched to the newest ready dataset, so load one first.
  await nav.getByRole("link", { name: "Data" }).click();
  await page.getByRole("button", { name: "Upload data" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page
    .getByLabel("Data files")
    .setInputFiles([fixture("transactions.csv"), fixture("employees.csv")]);
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/data\/[0-9a-f-]{36}$/);

  await nav.getByRole("link", { name: "Rules" }).click();
  await page.getByRole("button", { name: "Upload policy" }).click();
  await page.getByLabel("Policy document").setInputFiles(fixture("policy_rules.md"));
  await page.getByRole("button", { name: "Upload and draft" }).click();
  await expect(page.getByRole("status")).toContainText("8 rules found");
  await expect(page.getByTestId("rule-row")).toHaveCount(8);

  await page.getByRole("link", { name: "Approval of large allowance changes" }).click();
  await expect(page).toHaveURL(/\/admin\/rules\/R-01$/);
  await expect(
    page.getByText("Allowance changes above AED 10,000 must be approved", { exact: false }),
  ).toBeVisible();
  await expect(page.getByTestId("rule-preview")).toContainText(
    "Flags 7 of 88 transactions it applies to.",
  );
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("heading", { name: "Live check" })).toBeVisible();
  await expect(page.getByTestId("rule-version").first()).toContainText("Live");

  await nav.getByRole("link", { name: "Set up" }).click();
  await expect(page.getByTestId("setup-step").nth(2)).toContainText("8 rules · 1 live");

  // Leave no files behind in Storage: delete the pack (its record stays, as rule versions use it).
  await nav.getByRole("link", { name: "Data" }).click();
  await page
    .getByTestId("dataset-row")
    .filter({ hasText: name })
    .getByRole("link", { name })
    .click();
  await page.getByRole("button", { name: "Delete dataset" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete dataset" }).click();
  await expect(page.getByText("This dataset was deleted.", { exact: false })).toBeVisible();
});
