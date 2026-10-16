import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { signIn, startInEnglish, USERS } from "./helpers.js";

const fixture = (name: string) =>
  fileURLToPath(new URL(`../../sample-data/fixtures/small/${name}`, import.meta.url));

test.beforeEach(async ({ page }) => {
  await startInEnglish(page);
});

/** Approves a rule's draft through the API (the rules test covers those screens), unless it is live. */
async function approve(page: Page, ruleId: string): Promise<void> {
  const response = await page.request.get(`/api/v1/rules/${ruleId}`);
  const { rule } = (await response.json()) as {
    rule: { rowVersion: number; versions: Array<{ status: string }> };
  };
  if (rule.versions.some((version) => version.status === "active")) return;
  const approved = await page.request.post(`/api/v1/rules/${ruleId}/approve`, {
    headers: { "x-hrcc-request": "1" },
    data: { rowVersion: rule.rowVersion },
  });
  expect(approved.status()).toBe(200);
}

test("an admin runs the live rules and downloads the findings in the finding format", async ({
  page,
}) => {
  const name = `E2E runs pack ${Date.now()}`;
  const nav = page.getByRole("navigation", { name: "Main" });
  await signIn(page, USERS.admin);

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
  for (const ruleId of ["R-01", "R-02", "R-03"]) await approve(page, ruleId);

  await nav.getByRole("link", { name: "Set up" }).click();
  await page.getByRole("link", { name: "Go to finding format" }).click();
  await page.getByLabel("Finding format").setInputFiles(fixture("finding_format.csv"));
  await page.getByRole("button", { name: "Upload format" }).click();
  await expect(page.getByLabel("Field for transaction_id")).toHaveValue("transaction_id");
  await page.getByRole("button", { name: "Confirm mapping" }).click();
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();

  await nav.getByRole("link", { name: "Runs" }).click();
  await page.getByRole("button", { name: "Run checks" }).click();
  await expect(page).toHaveURL(/\/admin\/runs\/RUN-\d{4}-\d{2}-\d{2}-\d{2,}$/);
  // The pack plants 7 breaks of R-01, 8 of R-02 and 1 of R-03.
  await expect(page.getByTestId("run-total").nth(1)).toContainText("16");
  await expect(page.getByTestId("worked-example").first()).toContainText("Found");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download findings (CSV)" }).click(),
  ]);
  const csv = readFileSync(await download.path(), "utf8");
  expect(csv.split("\n")[0]).toBe(
    "finding_id,transaction_id,rule_id,severity,description,evidence,owner,recommended_action",
  );
  expect(csv).toContain("TX-000004,R-01,High,");

  // Leave no files behind in Storage.
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
