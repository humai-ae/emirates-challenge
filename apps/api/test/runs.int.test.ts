import type { RunResponse, RunsListResponse } from "@hrcc/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RUNS_LOCK_KEY } from "../src/runs/runs.service.js";
import { fixture, mappingOf, uploadPack } from "./packs.js";
import { CSRF, createTestApp, signIn, type TestApp } from "./test-app.js";

type Agent = Awaited<ReturnType<typeof signIn>>;

describe("runs", () => {
  let t: TestApp;
  let admin: Agent;
  let datasetId: string;
  let firstRun: string;
  beforeAll(async () => {
    t = await createTestApp();
    admin = await signIn(t, "layla.haddad@emirates.test");
  });
  afterAll(async () => {
    await t.close();
  });

  const start = (agent: Agent = admin) => agent.post("/api/v1/runs").set(CSRF).send({});

  it("needs data and a live rule before it can run", async () => {
    expect((await start().expect(409)).body).toEqual({ code: "no_dataset", params: {} });
    datasetId = (await uploadPack(admin)).id;
    await admin
      .post("/api/v1/policies")
      .set(CSRF)
      .attach("policy", fixture("policy_rules.md"), "policy_rules.md")
      .expect(201);
    expect((await start().expect(409)).body.code).toBe("no_live_rules");
  });

  it("runs every live rule over the newest dataset and keeps what it found", async () => {
    for (const id of ["R-01", "R-02", "R-03"]) {
      await admin.post(`/api/v1/rules/${id}/approve`).set(CSRF).send({ rowVersion: 1 }).expect(200);
    }
    const { run } = (await start().expect(201)).body as RunResponse;
    firstRun = run.id;
    expect(run.id).toMatch(/^RUN-\d{4}-\d{2}-\d{2}-01$/);
    expect(run).toMatchObject({
      status: "complete",
      dataset: { id: datasetId, name: "Training pack" },
      startedBy: "Layla Haddad",
    });
    // The pack plants 1 break of R-01, 7 of R-02 and 1 of R-03; two R-02 rows have no approver.
    expect(run.totals).toMatchObject({
      transactions: 300,
      findings: 9,
      couldNotCheck: 2,
      waitingForAi: 0,
    });
    expect(run.rules.map((rule) => [rule.ruleId, rule.counts.flagged, rule.error])).toEqual([
      ["R-01", 1, null],
      ["R-02", 7, null],
      ["R-03", 1, null],
    ]);
    const stored: Array<{ outcome: string; count: number; max: number | null }> =
      await t.dataSource.query(
        "SELECT outcome, count(*)::int AS count, max(finding_no) AS max FROM run_results WHERE run_id = $1 GROUP BY outcome ORDER BY outcome",
        [run.id],
      );
    expect(stored).toEqual([
      { outcome: "could_not_check", count: 2, max: null },
      { outcome: "flagged", count: 9, max: 9 },
    ]);
    const events = await t.dataSource.query(
      "SELECT object_id, after FROM audit_events WHERE action = 'run.start'",
    );
    expect(events).toEqual([
      { object_id: run.id, after: expect.objectContaining({ name: run.id, findings: 9 }) },
    ]);
  });

  it("lists runs newest first, reads one, and lets analysts start them", async () => {
    const analyst = await signIn(t, "omar.siddiqui@emirates.test");
    const second = ((await start(analyst).expect(201)).body as RunResponse).run;
    expect(second.id).toMatch(/-02$/);
    expect(second.startedBy).toBe("Omar Siddiqui");
    const list = (await analyst.get("/api/v1/runs").expect(200)).body as RunsListResponse;
    expect(list.runs.map((run) => run.id)).toEqual([second.id, firstRun]);
    const auditor = await signIn(t, "daniel.mensah@emirates.test");
    const detail = (await auditor.get(`/api/v1/runs/${firstRun}`).expect(200)).body as RunResponse;
    expect(detail).toMatchObject({
      run: { id: firstRun },
      workedExamples: null,
      exportReady: false,
    });
    await start(auditor).expect(403);
    const lead = await signIn(t, "priya.nair@emirates.test");
    await lead.get("/api/v1/runs").expect(403);
    expect((await admin.get("/api/v1/runs/RUN-2026-01-01-99").expect(404)).body.code).toBe(
      "not_found",
    );
    await admin.get("/api/v1/runs/not-a-run").expect(400);
  });

  it("refuses a second run while one is running", async () => {
    const before: Array<{ count: number }> = await t.dataSource.query(
      "SELECT count(*)::int AS count FROM runs",
    );
    // Another session holds the run lock, as a run in progress would.
    const runner = t.dataSource.createQueryRunner();
    await runner.connect();
    try {
      await runner.query("SELECT pg_advisory_lock($1)", [RUNS_LOCK_KEY]);
      expect((await start().expect(409)).body).toEqual({ code: "run_in_progress", params: {} });
    } finally {
      await runner.query("SELECT pg_advisory_unlock($1)", [RUNS_LOCK_KEY]);
      await runner.release();
    }
    const after: Array<{ count: number }> = await t.dataSource.query(
      "SELECT count(*)::int AS count FROM runs",
    );
    expect(after).toEqual(before);
  });

  it("reports a rule that can't run on this dataset, and runs the others", async () => {
    const detail = await admin.get(`/api/v1/datasets/${datasetId}`).expect(200);
    await admin
      .patch(`/api/v1/datasets/${datasetId}/columns`)
      .set(CSRF)
      .send(mappingOf(detail.body.dataset.columns, ["approver_ids"]))
      .expect(200);
    const { run } = (await start().expect(201)).body as RunResponse;
    expect(run.status).toBe("complete_with_errors");
    const [r01, r02, r03] = run.rules;
    expect(r01?.error).toMatch(/can't run/);
    expect(r02?.error).toMatch(/can't run/);
    expect(r03).toMatchObject({ error: null, counts: expect.objectContaining({ flagged: 1 }) });
    expect(run.totals.findings).toBe(1);
  });
});
