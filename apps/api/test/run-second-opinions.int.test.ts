import type { RuleResponse, RulesListResponse, RunResponse } from "@hrcc/shared";
import { describe, expect, it, vi } from "vitest";
import { CheckDatasetsService } from "../src/rules/check-datasets.service.js";
import { RunSecondOpinionsService } from "../src/runs/run-second-opinions.service.js";
import { AI_TOKEN, type FakeAi, startFakeAi } from "./fake-ai.js";
import { type Agent, approve, confirmFormat, EMAILS } from "./flags-setup.js";
import { fixture, uploadPack } from "./packs.js";
import { CSRF, createTestApp, signIn, type TestApp } from "./test-app.js";
import { waitFor } from "./wait.js";

/** The pack loaded, its policy drafted, and R-01 to R-03 live: the three checks the fake AI drafts. */
async function ready(t: TestApp, transactions?: Buffer): Promise<Agent> {
  const admin = await signIn(t, EMAILS.admin);
  await uploadPack(admin, "Training pack", transactions);
  await admin
    .post("/api/v1/policies")
    .set(CSRF)
    .attach("policy", fixture("policy_rules.md"), "policy_rules.md")
    .expect(201);
  await waitFor(async () => {
    const { rules } = (await admin.get("/api/v1/rules").expect(200)).body as RulesListResponse;
    return rules.every((rule) => rule.versions.every((version) => version.status !== "drafting"));
  });
  for (const id of ["R-01", "R-02", "R-03"]) await approve(admin, id);
  return admin;
}

/** A rule's draft set to a check type by the admin, then approved. */
async function liveAs(
  admin: Agent,
  id: string,
  preset: string,
  values: Record<string, unknown>,
): Promise<void> {
  const { rule } = (await admin.get(`/api/v1/rules/${id}`).expect(200)).body as RuleResponse;
  await admin
    .patch(`/api/v1/rules/${id}/draft`)
    .set(CSRF)
    .send({
      rowVersion: rule.rowVersion,
      preset,
      values,
      severity: "Medium",
      ownerTeamId: null,
      suggestedActionEn: "Check the transaction.",
      suggestedActionAr: "تحقّق من المعاملة.",
      criteria: null,
    })
    .expect(200);
  await approve(admin, id);
}

/** The pack with one justification that names a person none of the first transactions involve. */
function withNamedJustification(): Buffer {
  const [head = "", ...lines] = fixture("transactions.csv").toString("utf8").trimEnd().split("\n");
  const at = head.split(",").indexOf("justification");
  const [first = "", ...rest] = lines;
  const cells = first.split(",");
  cells[at] = "Agreed with E-0002 by phone";
  return Buffer.from(`${[head, cells.join(","), ...rest].join("\n")}\n`, "utf8");
}

/** A run set going by hand: its second opinion running over four transactions, none read. */
async function runningByHand(t: TestApp, run: RunResponse["run"]): Promise<RunResponse["run"]> {
  const [{ totals }]: Array<{ totals: Record<string, unknown> }> = await t.dataSource.query(
    "SELECT totals FROM runs WHERE id = $1",
    [run.id],
  );
  await t.dataSource.query("UPDATE runs SET totals = $2 WHERE id = $1", [
    run.id,
    JSON.stringify({
      ...totals,
      secondOpinionState: "running",
      secondOpinionTotal: 4,
      secondOpinionDone: 0,
    }),
  ]);
  return run;
}

const start = async (admin: Agent, body: object = {}) =>
  ((await admin.post("/api/v1/runs").set(CSRF).send(body).expect(201)).body as RunResponse).run;

/** The run once its second opinion stopped running. */
async function settled(admin: Agent, runId: string): Promise<RunResponse["run"]> {
  const read = async () =>
    ((await admin.get(`/api/v1/runs/${runId}`).expect(200)).body as RunResponse).run;
  await waitFor(async () => (await read()).totals.secondOpinionState !== "running", 60_000);
  return read();
}

const appWith = (fake: FakeAi) =>
  createTestApp({ AI_SERVICE_URL: fake.url, AI_SERVICE_TOKEN: AI_TOKEN, JOBS_POLL_SECONDS: "0.5" });
const sentTo = (fake: FakeAi, path: string) => fake.received.filter((item) => item.path === path);
const OPINIONS = "/v1/second-opinion/evaluate";

/** Jev is sure every transaction breaks every rule, with enough to judge. */
const sureItBreaks = (request: Parameters<FakeAi["secondOpinion"]>[0]) => ({
  answers: request.transactions.flatMap((transaction) =>
    transaction.rules.map((index) => ({
      key: transaction.key,
      rule: request.rules[index]?.id ?? "",
      pBreak: 0.95,
    })),
  ),
  enough: request.transactions.map((transaction) => ({ key: transaction.key, p: 0.9 })),
});

describe("second opinions after a run", () => {
  it("doesn't ask when the run is started without a second opinion, or without Jev", async () => {
    const fake = await startFakeAi();
    const t = await appWith(fake);
    try {
      const admin = await ready(t);
      const run = await start(admin, { secondOpinion: false });
      expect(run.totals.secondOpinionState).toBe("off");
      expect(sentTo(fake, OPINIONS)).toEqual([]);
    } finally {
      await t.close();
      await fake.close();
    }
    const plain = await createTestApp();
    try {
      const run = await start(await ready(plain));
      expect(run.totals.secondOpinionState).toBe("off");
    } finally {
      await plain.close();
    }
  });

  it("asks Jev about every applicable transaction, and keeps only strong disagreements", async () => {
    const fake = await startFakeAi();
    fake.providers = { typesafe: true, textModel: false };
    fake.secondOpinion = sureItBreaks;
    const t = await appWith(fake);
    try {
      const admin = await ready(t);
      const run = await start(admin);
      expect(run.totals.secondOpinionState).toBe("running");
      expect(run.totals.secondOpinionTotal).toBeGreaterThan(0);
      const done = await settled(admin, run.id);
      expect(done.totals.secondOpinionState).toBe("done");
      expect(done.totals.secondOpinionDone).toBe(done.totals.secondOpinionTotal);
      // Sure every transaction breaks: a disagreement wherever the check passed it, nowhere else.
      const passed = done.rules.reduce((sum, rule) => sum + rule.counts.passed, 0);
      expect(done.totals.disagreements).toBe(passed);
      const [{ count }]: Array<{ count: number }> = await t.dataSource.query(
        "SELECT count(*)::int AS count FROM second_opinions WHERE run_id = $1 AND code = 'passed'",
        [run.id],
      );
      expect(count).toBe(passed);
      // At most ten transactions per request.
      for (const call of sentTo(fake, OPINIONS)) {
        expect((call.body.transactions as unknown[]).length).toBeLessThanOrEqual(10);
      }
      const [audit]: Array<{ after: Record<string, unknown> }> = await t.dataSource.query(
        "SELECT after FROM audit_events WHERE action = 'run.second_opinion_complete' AND object_id = $1",
        [run.id],
      );
      expect(audit?.after).toMatchObject({ disagreements: passed });
    } finally {
      await t.close();
      await fake.close();
    }
  });

  it("asks Jev with people as tokens", async () => {
    const fake = await startFakeAi();
    fake.providers = { typesafe: true, textModel: false };
    const t = await appWith(fake);
    try {
      const admin = await ready(t, withNamedJustification());
      // A reporting line and a text that names someone are read too.
      await liveAs(admin, "R-06", "required_field", { field: "justification" });
      await liveAs(admin, "R-09", "approver_is_manager", {
        approver: "first",
        reach: "reporting_line",
      });
      await settled(admin, (await start(admin)).id);
      const sent = JSON.stringify(sentTo(fake, OPINIONS).map((call) => call.body));
      expect(sent).toContain("[EMP_");
      expect(sent).toContain("reporting_line");
      expect(sent).toContain("Agreed with [EMP_");
      const ids: Array<{ employee_id: string }> = await t.dataSource.query(
        "SELECT DISTINCT employee_id FROM employees",
      );
      const named = (id: string) => new RegExp(`(?<![A-Za-z0-9_-])${id}(?![A-Za-z0-9_-])`);
      expect(ids.filter((row) => named(row.employee_id).test(sent))).toEqual([]);
    } finally {
      await t.close();
      await fake.close();
    }
  });

  it("finishes when the last slice does, whatever the order, and counts each slice once", async () => {
    const fake = await startFakeAi();
    fake.secondOpinion = sureItBreaks;
    const t = await appWith(fake);
    try {
      const admin = await ready(t);
      // Started without one, then set going by hand: the slices are run here, out of order.
      const run = await start(admin, { secondOpinion: false });
      const [{ totals }]: Array<{ totals: Record<string, unknown> }> = await t.dataSource.query(
        "SELECT totals FROM runs WHERE id = $1",
        [run.id],
      );
      await t.dataSource.query("UPDATE runs SET totals = $2 WHERE id = $1", [
        run.id,
        JSON.stringify({ ...totals, secondOpinionState: "running", secondOpinionTotal: 4 }),
      ]);
      const service = t.app.get(RunSecondOpinionsService);
      const slice = (first: number) => ({
        data: { runId: run.id, first, last: first + 1 },
        retryCount: 0,
        retryLimit: 2,
      });
      const totalsNow = async () =>
        ((await admin.get(`/api/v1/runs/${run.id}`).expect(200)).body as RunResponse).run.totals;
      await service.ask(slice(3));
      const once = await totalsNow();
      await service.ask(slice(3));
      expect(await totalsNow()).toEqual(once);
      expect(once).toMatchObject({ secondOpinionState: "running", secondOpinionDone: 2 });
      await service.ask(slice(1));
      expect(await totalsNow()).toMatchObject({
        secondOpinionState: "done",
        secondOpinionDone: 4,
      });
    } finally {
      await t.close();
      await fake.close();
    }
  });

  it("counts a slice as failed when its last try fails, whatever failed, or when it is given up", async () => {
    const fake = await startFakeAi();
    const t = await appWith(fake);
    try {
      const admin = await ready(t);
      const run = await runningByHand(t, await start(admin, { secondOpinion: false }));
      const service = t.app.get(RunSecondOpinionsService);
      const slice = (first: number, retryCount: number) => ({
        data: { runId: run.id, first, last: first + 1 },
        retryCount,
        retryLimit: 2,
      });
      const totalsNow = async () =>
        ((await admin.get(`/api/v1/runs/${run.id}`).expect(200)).body as RunResponse).run.totals;
      const reading = vi
        .spyOn(t.app.get(CheckDatasetsService), "byId")
        .mockRejectedValue(new Error("connection reset"));
      // Not its last try: left to pg-boss to try again.
      await expect(service.ask(slice(1, 0))).rejects.toThrow("connection reset");
      expect(await totalsNow()).toMatchObject({ secondOpinionDone: 0 });
      // Its last try: counted, as failed.
      await service.ask(slice(1, 2));
      expect(await totalsNow()).toMatchObject({
        secondOpinionDone: 2,
        secondOpinionState: "running",
      });
      reading.mockRestore();
      // A slice pg-boss gave up on, such as one whose worker died on its last try, arrives as a
      // dead letter and is counted too.
      const [queue]: Array<{ dead_letter: string | null }> = await t.dataSource.query(
        "SELECT dead_letter FROM pgboss.queue WHERE name = 'run.second_opinion'",
      );
      expect(queue?.dead_letter).toBe("run.second_opinion.given_up");
      // A queue made before it had one gets it when the app starts again.
      await t.dataSource.query(
        "UPDATE pgboss.queue SET dead_letter = NULL WHERE name = 'run.second_opinion'",
      );
      await service.onModuleInit();
      const [again]: Array<{ dead_letter: string | null }> = await t.dataSource.query(
        "SELECT dead_letter FROM pgboss.queue WHERE name = 'run.second_opinion'",
      );
      expect(again?.dead_letter).toBe("run.second_opinion.given_up");
      await service.givenUp({ data: { runId: run.id, first: 3, last: 4 } });
      expect(await totalsNow()).toMatchObject({
        secondOpinionDone: 4,
        secondOpinionState: "failed",
      });
    } finally {
      await t.close();
      await fake.close();
    }
  });

  it("ends a second opinion still running when the app starts without background jobs", async () => {
    const t = await createTestApp();
    try {
      const admin = await ready(t);
      const run = await runningByHand(t, await start(admin));
      // Without the AI service, nothing will ever read the rest.
      await t.app.get(RunSecondOpinionsService).onModuleInit();
      const { totals } = (
        (await admin.get(`/api/v1/runs/${run.id}`).expect(200)).body as RunResponse
      ).run;
      expect(totals.secondOpinionState).toBe("failed");
      const [event]: Array<{ after: Record<string, unknown> }> = await t.dataSource.query(
        "SELECT after FROM audit_events WHERE action = 'run.second_opinion_complete' AND object_id = $1",
        [run.id],
      );
      expect(event?.after).toMatchObject({ state: "failed" });
    } finally {
      await t.close();
    }
  });

  it("keeps second opinions out of results, flags and the export", async () => {
    const fake = await startFakeAi();
    fake.providers = { typesafe: true, textModel: false };
    fake.secondOpinion = sureItBreaks;
    const t = await appWith(fake);
    try {
      const admin = await ready(t);
      await confirmFormat(admin);
      const run = await start(admin);
      // Rule flags only: the pattern search may add its own in the background meanwhile.
      const counts = async () =>
        (await t.dataSource.query(
          `SELECT (SELECT count(*)::int FROM run_results WHERE run_id = $1) AS results,
                  (SELECT count(*)::int FROM flags WHERE run_id = $1 AND kind = 'rule_break') AS flags`,
          [run.id],
        )) as Array<{ results: number; flags: number }>;
      const before = await counts();
      const csvBefore = (await admin.get(`/api/v1/runs/${run.id}/export`).expect(200)).text;
      const done = await settled(admin, run.id);
      expect(done.totals.disagreements).toBeGreaterThan(0);
      expect(await counts()).toEqual(before);
      expect((await admin.get(`/api/v1/runs/${run.id}/export`).expect(200)).text).toBe(csvBefore);
      expect(done.totals.findings).toBe(run.totals.findings);
    } finally {
      await t.close();
      await fake.close();
    }
  });
});
