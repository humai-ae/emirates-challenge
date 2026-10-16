import { readCsv } from "@hrcc/engine";
import type { FindingFormatResponse, RuleResponse, RunResponse } from "@hrcc/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixture, uploadPack } from "./packs.js";
import { CSRF, createTestApp, signIn, type TestApp } from "./test-app.js";

type Agent = Awaited<ReturnType<typeof signIn>>;

describe("owners in a run's findings", () => {
  let t: TestApp;
  let admin: Agent;
  beforeAll(async () => {
    t = await createTestApp();
    admin = await signIn(t, "layla.haddad@emirates.test");
    await uploadPack(admin);
    await admin
      .post("/api/v1/policies")
      .set(CSRF)
      .attach("policy", fixture("policy_rules.md"), "policy_rules.md")
      .expect(201);
    const teams = (await admin.get("/api/v1/teams").expect(200)).body.teams as Array<{
      id: string;
      nameEn: string;
    }>;
    // R-02 (every type) is owned by Onboarding unless routing says otherwise.
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
        ownerTeamId: teams.find((team) => team.nameEn === "Onboarding")?.id,
        suggestedActionEn: draft?.suggestedActionEn,
        suggestedActionAr: draft?.suggestedActionAr,
      })
      .expect(200);
    for (const id of ["R-01", "R-02"]) {
      const rule = ((await admin.get(`/api/v1/rules/${id}`).expect(200)).body as RuleResponse).rule;
      await admin
        .post(`/api/v1/rules/${id}/approve`)
        .set(CSRF)
        .send({ rowVersion: rule.rowVersion })
        .expect(200);
    }
    await admin
      .put("/api/v1/routing")
      .set(CSRF)
      .send({ rows: [{ type: "allowance_change", teamName: "Payroll Operations" }] })
      .expect(200);
    const format = await admin
      .post("/api/v1/finding-formats")
      .set(CSRF)
      .attach("format", fixture("finding_format.csv"), "finding_format.csv")
      .expect(201);
    const confirmed = (format.body as FindingFormatResponse).format;
    if (!confirmed) throw new Error("The format wasn't kept");
    const { id, mapping } = confirmed;
    await admin
      .patch(`/api/v1/finding-formats/${id}/mapping`)
      .set(CSRF)
      .send({ rowVersion: 1, mapping })
      .expect(200);
  });
  afterAll(async () => {
    await t.close();
  });

  /** Each exported finding's rule, transaction type (by its transaction) and owner. */
  async function exported(runId: string, types: Map<string, string>) {
    const response = await admin.get(`/api/v1/runs/${runId}/export`).expect(200);
    const table = readCsv(new TextEncoder().encode(response.text));
    if (!table.ok) throw new Error("The export can't be read");
    const header = table.table.header;
    const at = (name: string) => header.indexOf(name);
    return table.table.rows.map((row) => [
      row[at("rule_id")],
      types.get(row[at("transaction_id")] ?? ""),
      row[at("owner")],
    ]);
  }

  it("fills the owner from the routing kept with the run, then the rule's own team", async () => {
    const run = (
      (await admin.post("/api/v1/runs").set(CSRF).send({}).expect(201)).body as RunResponse
    ).run;
    const transactions = readCsv(fixture("transactions.csv"));
    if (!transactions.ok) throw new Error("The pack can't be read");
    const types = new Map(transactions.table.rows.map((row) => [row[0] ?? "", row[1] ?? ""]));
    const rows = await exported(run.id, types);
    expect(rows.length).toBeGreaterThan(0);
    for (const [ruleId, type, owner] of rows) {
      if (type === "allowance_change") expect(owner).toBe("Payroll Operations");
      else expect(owner).toBe(ruleId === "R-02" ? "Onboarding" : "");
    }
    // Routing changed later doesn't change what the run exports.
    await admin
      .put("/api/v1/routing")
      .set(CSRF)
      .send({ rows: [{ type: "allowance_change", teamName: "Employee Services" }] })
      .expect(200);
    expect(await exported(run.id, types)).toEqual(rows);
  });
});
