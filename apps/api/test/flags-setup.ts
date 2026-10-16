import type {
  FindingFormatResponse,
  RuleResponse,
  RulesListResponse,
  RunResponse,
} from "@hrcc/shared";
import { fixture, uploadPack } from "./packs.js";
import { CSRF, signIn, type TestApp } from "./test-app.js";
import { waitFor } from "./wait.js";

export type Agent = Awaited<ReturnType<typeof signIn>>;

export const EMAILS = {
  admin: "layla.haddad@emirates.test",
  analyst: "omar.siddiqui@emirates.test",
  payrollLead: "priya.nair@emirates.test",
  onboardingLead: "ahmed.rahman@emirates.test",
  auditor: "daniel.mensah@emirates.test",
} as const;

export interface FlagsFixture {
  admin: Agent;
  runId: string;
  teams: { payroll: string; onboarding: string };
}

/** Approves a rule's open draft as it stands. */
export async function approve(admin: Agent, id: string): Promise<void> {
  const rule = ((await admin.get(`/api/v1/rules/${id}`).expect(200)).body as RuleResponse).rule;
  await admin
    .post(`/api/v1/rules/${id}/approve`)
    .set(CSRF)
    .send({ rowVersion: rule.rowVersion })
    .expect(200);
}

/**
 * The small pack with R-01 to R-04 live, R-02 owned by Onboarding and allowance changes routed to
 * Payroll & Compensation, run once: 13 flags, F-000001 to F-000013 in rule and file order.
 */
export async function runWithFlags(t: TestApp): Promise<FlagsFixture> {
  const admin = await signIn(t, EMAILS.admin);
  await uploadPack(admin);
  await admin
    .post("/api/v1/policies")
    .set(CSRF)
    .attach("policy", fixture("policy_rules.md"), "policy_rules.md")
    .expect(201);
  // With AI set, drafts are written in the background: wait until none is still drafting.
  await waitFor(async () => {
    const { rules } = (await admin.get("/api/v1/rules").expect(200)).body as RulesListResponse;
    return rules.every((rule) => rule.versions.every((version) => version.status !== "drafting"));
  });
  const teams = (await admin.get("/api/v1/teams").expect(200)).body.teams as Array<{
    id: string;
    nameEn: string;
  }>;
  const payroll = teams.find((team) => team.nameEn === "Payroll & Compensation")?.id ?? "";
  const onboarding = teams.find((team) => team.nameEn === "Onboarding")?.id ?? "";
  const r02 = ((await admin.get("/api/v1/rules/R-02").expect(200)).body as RuleResponse).rule;
  const draft = r02.versions[0];
  await admin
    .patch("/api/v1/rules/R-02/draft")
    .set(CSRF)
    .send({
      rowVersion: r02.rowVersion,
      preset: draft?.preset,
      values: Object.fromEntries(
        (draft?.parameters ?? []).map((parameter) => [parameter.name, parameter.value]),
      ),
      severity: draft?.severity,
      ownerTeamId: onboarding,
      suggestedActionEn: draft?.suggestedActionEn,
      suggestedActionAr: draft?.suggestedActionAr,
    })
    .expect(200);
  for (const id of ["R-01", "R-02", "R-03", "R-04"]) await approve(admin, id);
  await admin
    .put("/api/v1/routing")
    .set(CSRF)
    .send({ rows: [{ type: "allowance_change", teamName: "Payroll & Compensation" }] })
    .expect(200);
  const { run } = (await admin.post("/api/v1/runs").set(CSRF).send({}).expect(201))
    .body as RunResponse;
  return { admin, runId: run.id, teams: { payroll, onboarding } };
}

/**
 * The small pack with R-07 live as a judgment rule: its pay changes above AED 5,000 have
 * justifications for AI to read, and some have none, which breaks the rule in code. The admin
 * writes the draft, so whether AI or keywords drafted it doesn't matter.
 */
export async function runWithJudgments(
  t: TestApp,
): Promise<{ admin: Agent; run: RunResponse["run"] }> {
  const admin = await signIn(t, EMAILS.admin);
  await uploadPack(admin);
  await admin
    .post("/api/v1/policies")
    .set(CSRF)
    .attach("policy", fixture("policy_rules.md"), "policy_rules.md")
    .expect(201);
  const read = async () =>
    ((await admin.get("/api/v1/rules/R-07").expect(200)).body as RuleResponse).rule;
  // Drafting may run in the background: wait until R-07's draft can be edited.
  await waitFor(async () => (await read()).versions[0]?.status !== "drafting");
  const r07 = await read();
  const draft = r07.versions[0];
  await admin
    .patch("/api/v1/rules/R-07/draft")
    .set(CSRF)
    .send({
      rowVersion: r07.rowVersion,
      preset: "text_judgment",
      values: { types: ["pay_change"], text_field: "justification", amount_over: 5000 },
      severity: "Medium",
      ownerTeamId: null,
      suggestedActionEn: draft?.suggestedActionEn,
      suggestedActionAr: draft?.suggestedActionAr,
    })
    .expect(200);
  await approve(admin, "R-07");
  const { run } = (await admin.post("/api/v1/runs").set(CSRF).send({}).expect(201))
    .body as RunResponse;
  return { admin, run };
}

/** Uploads the pack's finding format and confirms its mapping as proposed, so runs can export. */
export async function confirmFormat(admin: Agent): Promise<void> {
  await admin
    .post("/api/v1/finding-formats")
    .set(CSRF)
    .attach("format", fixture("finding_format.csv"), "finding_format.csv")
    .expect(201);
  const { format } = (await admin.get("/api/v1/finding-formats/current").expect(200))
    .body as FindingFormatResponse;
  await admin
    .patch(`/api/v1/finding-formats/${format?.id}/mapping`)
    .set(CSRF)
    .send({ rowVersion: 1, mapping: format?.mapping })
    .expect(200);
}
