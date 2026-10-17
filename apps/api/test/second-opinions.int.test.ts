import type {
  FlagResponse,
  RuleResponse,
  RulesListResponse,
  RunResponse,
  SecondOpinion,
  SecondOpinionResponse,
  SecondOpinionsResponse,
} from "@hrcc/shared";
import { describe, expect, it } from "vitest";
import { AI_TOKEN, type FakeAi, startFakeAi } from "./fake-ai.js";
import { type Agent, approve, EMAILS } from "./flags-setup.js";
import { fixture, uploadPack } from "./packs.js";
import { CSRF, createTestApp, signIn, type TestApp } from "./test-app.js";
import { waitFor } from "./wait.js";

type OpinionRequest = Parameters<FakeAi["secondOpinion"]>[0];

/** Jev answers every rule it is asked about, sure it has enough; how likely it breaks, by row. */
const answering = (pBreak: (index: number) => number) => (request: OpinionRequest) => ({
  answers: request.transactions.flatMap((transaction) =>
    transaction.rules.map((at) => ({
      key: transaction.key,
      rule: request.rules[at]?.id ?? "",
      pBreak: pBreak(Number(transaction.key.slice(1))),
    })),
  ),
  enough: request.transactions.map((transaction) => ({ key: transaction.key, p: 0.9 })),
});

async function withJev(
  secondOpinion: FakeAi["secondOpinion"],
  test: (t: TestApp) => Promise<void>,
): Promise<void> {
  const fake = await startFakeAi();
  fake.providers = { typesafe: true, textModel: false };
  fake.secondOpinion = secondOpinion;
  const t = await createTestApp({
    AI_SERVICE_URL: fake.url,
    AI_SERVICE_TOKEN: AI_TOKEN,
    JOBS_POLL_SECONDS: "0.5",
  });
  try {
    await test(t);
  } finally {
    await t.close();
    await fake.close();
  }
}

/** The pack loaded, its policy drafted, and R-01 to R-03 live: the checks the fake AI drafts. */
async function ready(t: TestApp): Promise<Agent> {
  const admin = await signIn(t, EMAILS.admin);
  await uploadPack(admin);
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

/** A run, once its second opinion has stopped running. */
async function runChecks(admin: Agent, body: object = {}): Promise<RunResponse["run"]> {
  const { run } = (await admin.post("/api/v1/runs").set(CSRF).send(body).expect(201))
    .body as RunResponse;
  const read = async () =>
    ((await admin.get(`/api/v1/runs/${run.id}`).expect(200)).body as RunResponse).run;
  await waitFor(async () => (await read()).totals.secondOpinionState !== "running", 60_000);
  return read();
}

const listOf = async (agent: Agent, query = "") =>
  (await agent.get(`/api/v1/second-opinions${query}`).expect(200)).body as SecondOpinionsResponse;
const nameOf = async (t: TestApp, email: string) =>
  (
    (await t.dataSource.query("SELECT display_name FROM users WHERE email = $1", [email])) as [
      { display_name: string },
    ]
  )[0].display_name;

describe("second opinions", () => {
  it("lists a run's strongest disagreements for analysts", async () => {
    // Sure every transaction breaks its rules, some surer than others.
    await withJev(
      answering((index) => 0.86 + (index % 14) / 100),
      async (t) => {
        const admin = await ready(t);
        const run = await runChecks(admin);
        const analyst = await signIn(t, EMAILS.analyst);
        const page = await listOf(analyst);
        const [{ total }]: Array<{ total: number }> = await t.dataSource.query(
          "SELECT count(*)::int AS total FROM second_opinions WHERE run_id = $1",
          [run.id],
        );
        expect(total).toBeGreaterThan(50);
        expect(page).toMatchObject({ runId: run.id, total });
        expect(page.opinions).toHaveLength(50);
        const strengths = page.opinions.map((opinion) => opinion.strength);
        expect(strengths).toEqual([...strengths].sort((a, b) => b - a));
        expect(strengths[0]).toBeCloseTo(0.99);
        const first = page.opinions[0] as SecondOpinion;
        expect(first).toMatchObject({
          runId: run.id,
          code: "passed",
          flagId: null,
          noted: null,
          reviewRequested: null,
          ruleTitle: run.rules.find((rule) => rule.ruleId === first.ruleId)?.title,
        });
        // The same run by name; a run that doesn't exist.
        expect(await listOf(analyst, `?runId=${run.id}`)).toEqual(page);
        await analyst.get("/api/v1/second-opinions?runId=RUN-nope").expect(404);
        // Admins and auditors read them too; team leads don't.
        expect((await listOf(admin)).total).toBe(total);
        expect((await listOf(await signIn(t, EMAILS.auditor))).total).toBe(total);
        await (await signIn(t, EMAILS.payrollLead)).get("/api/v1/second-opinions").expect(403);
        // One opened: the policy's words and the transaction's cells.
        const { opinion } = (await analyst.get(`/api/v1/second-opinions/${first.id}`).expect(200))
          .body as SecondOpinionResponse;
        expect(opinion).toMatchObject({ id: first.id, strength: first.strength });
        expect(opinion.ruleText).not.toBe("");
        expect(opinion.transaction).toContainEqual({
          column: "transaction_id",
          value: first.transactionId,
        });
        await analyst
          .get("/api/v1/second-opinions/00000000-0000-4000-8000-000000000000")
          .expect(404);
      },
    );
  });

  it("notes one, once", async () => {
    await withJev(
      answering(() => 0.95),
      async (t) => {
        await runChecks(await ready(t));
        const analyst = await signIn(t, EMAILS.analyst);
        const first = (await listOf(analyst)).opinions[0] as SecondOpinion;
        const noted = (
          await analyst.post(`/api/v1/second-opinions/${first.id}/noted`).set(CSRF).expect(200)
        ).body as SecondOpinionResponse;
        expect(noted.opinion.noted?.by).toBe(await nameOf(t, EMAILS.analyst));
        await analyst
          .post(`/api/v1/second-opinions/${first.id}/noted`)
          .set(CSRF)
          .expect(409, { code: "opinion_already_noted", params: {} });
        // Only analysts act on them.
        await (await signIn(t, EMAILS.auditor))
          .post(`/api/v1/second-opinions/${first.id}/noted`)
          .set(CSRF)
          .expect(403);
        await analyst
          .post("/api/v1/second-opinions/00000000-0000-4000-8000-000000000000/noted")
          .set(CSRF)
          .expect(404);
        const listed = (await listOf(analyst)).opinions.find((item) => item.id === first.id);
        expect(listed?.noted).toEqual(noted.opinion.noted);
        expect(listed?.reviewRequested).toBeNull();
        const events: Array<{ action: string; after: Record<string, unknown> }> =
          await t.dataSource.query(
            "SELECT action, after FROM audit_events WHERE object_id = $1 ORDER BY seq",
            [first.id],
          );
        expect(events).toEqual([
          {
            action: "second_opinion.noted",
            after: expect.objectContaining({ name: `${first.ruleId} · ${first.transactionId}` }),
          },
        ]);
      },
    );
  });

  it("asks for a rule review, which the rule's page lists", async () => {
    await withJev(
      answering(() => 0.95),
      async (t) => {
        const admin = await ready(t);
        await runChecks(admin);
        const analyst = await signIn(t, EMAILS.analyst);
        const { opinions } = await listOf(analyst);
        const ruleId = opinions[0]?.ruleId ?? "";
        const [older, newer] = opinions.filter((opinion) => opinion.ruleId === ruleId) as [
          SecondOpinion,
          SecondOpinion,
        ];
        for (const opinion of [older, newer]) {
          const { opinion: asked } = (
            await analyst.post(`/api/v1/second-opinions/${opinion.id}/review`).set(CSRF).expect(200)
          ).body as SecondOpinionResponse;
          expect(asked.reviewRequested?.by).toBe(await nameOf(t, EMAILS.analyst));
        }
        await analyst
          .post(`/api/v1/second-opinions/${older.id}/review`)
          .set(CSRF)
          .expect(409, { code: "review_already_requested", params: {} });
        const { reviewRequests } = (await admin.get(`/api/v1/rules/${ruleId}`).expect(200))
          .body as RuleResponse;
        expect(reviewRequests.map((request) => request.opinionId)).toEqual([newer.id, older.id]);
        expect(reviewRequests[0]).toMatchObject({
          transactionId: newer.transactionId,
          rowNo: newer.rowNo,
          code: "passed",
          pBreak: 0.95,
          by: await nameOf(t, EMAILS.analyst),
        });
        const other = ["R-01", "R-02", "R-03"].find((id) => id !== ruleId);
        expect(
          ((await admin.get(`/api/v1/rules/${other}`).expect(200)).body as RuleResponse)
            .reviewRequests,
        ).toEqual([]);
        const [event]: Array<{ after: Record<string, unknown> }> = await t.dataSource.query(
          "SELECT after FROM audit_events WHERE action = 'second_opinion.review_requested' AND object_id = $1",
          [older.id],
        );
        expect(event?.after).toMatchObject({ name: ruleId });
      },
    );
  });

  it("notes on a flag that AI thinks breaks no rule", async () => {
    // Sure the first run's even rows break nothing; unsure about the odd ones. Later, sure of all.
    let pBreak = (index: number): number => (index % 2 === 0 ? 0.05 : 0.5);
    await withJev(
      (request) => answering((index) => pBreak(index))(request),
      async (t) => {
        const admin = await ready(t);
        const first = await runChecks(admin);
        const analyst = await signIn(t, EMAILS.analyst);
        const flags: Array<{ id: string; rule_id: string; row_no: number }> =
          await t.dataSource.query(
            "SELECT id, rule_id, row_no FROM flags WHERE run_id = $1 AND kind = 'rule_break' ORDER BY id",
            [first.id],
          );
        const sure = flags.find((flag) => (flag.row_no - 1) % 2 === 0);
        const unsure = flags.find((flag) => (flag.row_no - 1) % 2 === 1);
        if (!sure || !unsure) throw new Error("the pack flags both even and odd rows");
        const noteOn = async (id: string) =>
          ((await analyst.get(`/api/v1/flags/${id}`).expect(200)).body as FlagResponse).flag
            .secondOpinion;
        expect(await noteOn(sure.id)).toEqual({ pBreak: 0.05, enough: 0.9 });
        expect(await noteOn(unsure.id)).toBeNull();
        const flagged = (await listOf(analyst)).opinions.filter(
          (opinion) => opinion.code === "flagged",
        );
        expect(flagged.length).toBeGreaterThan(0);
        expect(flagged.map((opinion) => opinion.flagId)).toContain(sure.id);
        // A later run finds the flag again: its second opinion is noted on the same flag.
        pBreak = () => 0.02;
        const second = await runChecks(admin);
        expect(await noteOn(unsure.id)).toEqual({ pBreak: 0.02, enough: 0.9 });
        const again = (await listOf(analyst)).opinions.find(
          (opinion) => opinion.ruleId === unsure.rule_id && opinion.rowNo === unsure.row_no,
        );
        expect(again).toMatchObject({ runId: second.id, flagId: unsure.id });
      },
    );
  });
});
