import { readCsv } from "@hrcc/engine";
import type { FindingFormatResponse, RunResponse } from "@hrcc/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixture, uploadPack } from "./packs.js";
import { CSRF, createTestApp, signIn, type TestApp } from "./test-app.js";

describe("run export", () => {
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof signIn>>;
  let runId: string;
  beforeAll(async () => {
    t = await createTestApp();
    admin = await signIn(t, "layla.haddad@emirates.test");
    await uploadPack(admin);
    await admin
      .post("/api/v1/policies")
      .set(CSRF)
      .attach("policy", fixture("policy_rules.md"), "policy_rules.md")
      .expect(201);
    for (const id of ["R-01", "R-02", "R-03"]) {
      await admin.post(`/api/v1/rules/${id}/approve`).set(CSRF).send({ rowVersion: 1 }).expect(200);
    }
    runId = ((await admin.post("/api/v1/runs").set(CSRF).send({}).expect(201)).body as RunResponse)
      .run.id;
  });
  afterAll(async () => {
    await t.close();
  });

  const exportCsv = () => admin.get(`/api/v1/runs/${runId}/export`);

  it("needs a confirmed format before exporting", async () => {
    expect((await exportCsv().expect(409)).body).toEqual({ code: "no_finding_format", params: {} });
    await admin
      .post("/api/v1/finding-formats")
      .set(CSRF)
      .attach("format", fixture("finding_format.csv"), "finding_format.csv")
      .expect(201);
    await exportCsv().expect(409);
    const detail = (await admin.get(`/api/v1/runs/${runId}`).expect(200)).body as RunResponse;
    expect(detail).toMatchObject({ workedExamples: null, exportReady: false });
  });

  it("exports the findings in the confirmed format", async () => {
    const { format } = (await admin.get("/api/v1/finding-formats/current").expect(200))
      .body as FindingFormatResponse;
    await admin
      .patch(`/api/v1/finding-formats/${format?.id}/mapping`)
      .set(CSRF)
      .send({ rowVersion: 1, mapping: format?.mapping })
      .expect(200);
    const response = await exportCsv().expect(200);
    expect(response.headers["content-type"]).toMatch(/^text\/csv/);
    expect(response.headers["content-disposition"]).toBe(
      `attachment; filename="${runId}-findings.csv"`,
    );
    const read = readCsv(new TextEncoder().encode(response.text));
    if (!read.ok) throw new Error(read.reason);
    expect(read.table.header).toEqual(format?.columns);
    expect(read.table.rows).toHaveLength(16);
    const [first] = read.table.rows;
    expect(first?.slice(0, 4)).toEqual(["F-0001", "TX-000004", "R-01", "High"]);
    expect(first?.[4]).toMatch(/^The amount .* is over 10,000/);
    expect(first?.[5]).toMatch(/^amount=/);
    expect(first?.[7]).toBe(
      "Get approval from an approver at the required grade, or reverse the change.",
    );
    const events = await t.dataSource.query(
      "SELECT after FROM audit_events WHERE action = 'run.export'",
    );
    expect(events).toEqual([{ after: expect.objectContaining({ name: runId, findings: 16 }) }]);
  });

  it("checks the format's worked examples against the run", async () => {
    const { workedExamples, exportReady } = (await admin.get(`/api/v1/runs/${runId}`).expect(200))
      .body as RunResponse;
    expect(exportReady).toBe(true);
    expect(
      workedExamples?.map((example) => [example.transactionId, example.ruleId, example.result]),
    ).toEqual([
      ["TX-000004", "R-01", "found"],
      ["TX-000007", "R-02", "found"],
      ["TX-000054", "R-03", "found"],
      ["TX-000039", "R-04", "rule_not_run"],
      ["TX-000172", "R-05", "rule_not_run"],
    ]);
  });

  it("lets analysts export, and keeps auditors and leads out", async () => {
    const analyst = await signIn(t, "omar.siddiqui@emirates.test");
    await analyst.get(`/api/v1/runs/${runId}/export`).expect(200);
    const auditor = await signIn(t, "daniel.mensah@emirates.test");
    await auditor.get(`/api/v1/runs/${runId}/export`).expect(403);
    const lead = await signIn(t, "priya.nair@emirates.test");
    await lead.get(`/api/v1/runs/${runId}/export`).expect(403);
  });
});
