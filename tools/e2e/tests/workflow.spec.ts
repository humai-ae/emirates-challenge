import { readFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { approve, CSRF, fixture, signIn, startInEnglish, USERS } from "./helpers.js";

/** A page signed in as this account, in a browser context of its own. */
async function signedIn(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await startInEnglish(page);
  await signIn(page, email);
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  return page;
}

const upload = (name: string, mimeType: string) => ({
  name,
  mimeType,
  buffer: readFileSync(fixture(name)),
});

test("a flag goes to its team, is fixed, checked and closed; another is dismissed", async ({
  browser,
}) => {
  // The policy's rules are drafted in the background before they can be approved.
  test.setTimeout(120_000);

  // The admin loads the pack, approves R-01 to R-03 and runs the checks (other tests cover those screens).
  const admin = await signedIn(browser, USERS.admin);
  const created = await admin.request.post("/api/v1/datasets", {
    headers: CSRF,
    multipart: {
      name: `E2E flags pack ${Date.now()}`,
      transactions: upload("transactions.csv", "text/csv"),
      employees: upload("employees.csv", "text/csv"),
    },
  });
  expect(created.status()).toBe(201);
  const { dataset } = (await created.json()) as { dataset: { id: string } };
  const policy = await admin.request.post("/api/v1/policies", {
    headers: CSRF,
    multipart: { policy: upload("policy_rules.md", "text/markdown") },
  });
  expect(policy.status()).toBe(201);
  for (const ruleId of ["R-01", "R-02", "R-03"]) await approve(admin, ruleId);
  expect((await admin.request.post("/api/v1/runs", { headers: CSRF, data: {} })).status()).toBe(
    201,
  );

  // The analyst confirms the R-01 flag on TX-000006 to Payroll & Compensation.
  const analyst = await signedIn(browser, USERS.analyst);
  const analystNav = analyst.getByRole("navigation", { name: "Main" });
  await expect(analystNav.getByRole("link", { name: /Exceptions inbox\s*\d+/ })).toBeVisible();
  await analystNav.getByRole("link", { name: /Exceptions inbox/ }).click();
  await analyst.getByLabel("Rule").selectOption("R-01");
  await analyst
    .getByTestId("flag-row")
    .filter({ hasText: "TX-000006" })
    .first()
    .getByRole("link")
    .click();
  await expect(analyst.getByRole("heading", { level: 1 })).toContainText("R-01");
  await expect(analyst.getByTestId("decision-panel")).toBeVisible();
  const sendToPayroll = analyst.getByRole("button", {
    name: "Yes, send to Payroll & Compensation",
  });
  if (await sendToPayroll.isVisible()) {
    await sendToPayroll.click();
  } else {
    // No routing for allowance changes yet: the analyst chooses the team.
    await analyst.getByRole("button", { name: "Yes, choose a team" }).click();
    await analyst
      .getByLabel("Send to which team?")
      .selectOption({ label: "Payroll & Compensation" });
  }
  await analyst.getByRole("button", { name: "Confirm and send" }).click();
  await expect(analyst.getByRole("status")).toContainText(
    "Confirmed and sent to Payroll & Compensation.",
  );
  const flagId = new URL(analyst.url()).pathname.split("/").at(-1) ?? "";
  expect(flagId).toMatch(/^F-\d{6,}$/);

  // The Payroll lead is told, takes it from the queue, fixes it and records what was done.
  const lead = await signedIn(browser, USERS.lead);
  await expect(lead.getByRole("button", { name: /Notices\s*\d+/ })).toBeVisible();
  await lead
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: /My team queue/ })
    .click();
  await lead.getByTestId("flag-row").filter({ hasText: flagId }).getByRole("link").click();
  await lead.getByRole("button", { name: "Start fixing" }).click();
  await expect(lead.getByRole("status")).toContainText("is fixing it.");
  await lead.getByLabel("Retrospective approval obtained").check();
  await lead.getByLabel("Details").fill("A grade 12 approver signed off in the HR system.");
  await lead.getByRole("button", { name: "Mark fixed" }).click();
  await expect(lead.getByRole("status")).toContainText("Marked fixed.");

  // The analyst checks the fix and closes the flag; its history shows every step.
  await analystNav.getByRole("link", { name: /Fix checks/ }).click();
  await analyst.getByTestId("flag-row").filter({ hasText: flagId }).getByRole("link").click();
  await analyst.getByRole("button", { name: "Fix looks right, close it" }).click();
  await expect(analyst.getByRole("status")).toContainText("Closed.");
  await expect(analyst.getByTestId("audit-row").last()).toContainText("checked the fix and closed");

  // An R-02 flag is dismissed, with a reason and a note.
  await analystNav.getByRole("link", { name: /Exceptions inbox/ }).click();
  await analyst.getByLabel("Rule").selectOption("R-02");
  await analyst.getByTestId("flag-row").first().getByRole("link").click();
  await analyst.getByRole("button", { name: "No, dismiss it" }).click();
  await analyst.getByLabel("False alarm: the rule doesn't fit this case").check();
  await analyst
    .getByLabel("Add a note for the record")
    .fill("The approver was acting head of department that week.");
  await analyst.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(analyst.getByRole("status")).toContainText("Dismissed.");

  // The inbox reads in Arabic too.
  await analystNav.getByRole("link", { name: /Exceptions inbox/ }).click();
  await analyst.getByRole("radio", { name: "العربية" }).click();
  await expect(analyst.getByRole("heading", { level: 1 })).toHaveText("صندوق الاستثناءات");

  // Leave no files behind in Storage.
  const removed = await admin.request.delete(`/api/v1/datasets/${dataset.id}`, { headers: CSRF });
  expect(removed.status()).toBe(200);
});
