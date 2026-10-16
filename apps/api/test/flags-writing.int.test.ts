import type { FlagResponse } from "@hrcc/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AI_TOKEN, type FakeAi, startFakeAi } from "./fake-ai.js";
import { EMAILS, runWithFlags } from "./flags-setup.js";
import { CSRF, createTestApp, signIn, type TestApp } from "./test-app.js";
import { waitFor } from "./wait.js";

/** Until AI has written, or given up on, every flag of the run. */
async function settled(t: TestApp, runId: string) {
  await waitFor(async () => {
    const [row]: Array<{ n: number }> = await t.dataSource.query(
      "SELECT count(*)::int AS n FROM flags WHERE run_id = $1 AND writing = 'pending'",
      [runId],
    );
    return row?.n === 0;
  });
}

/** A fake AI service that writes texts, with rules drafted from their own words. */
async function writer(): Promise<FakeAi> {
  const fake = await startFakeAi();
  fake.providers = { typesafe: false, textModel: true };
  fake.draft = () => "not_configured";
  fake.action = () => "not_configured";
  return fake;
}

describe("AI rewrites new flags' texts", () => {
  let t: TestApp;
  let fake: FakeAi;
  // Each test runs the checks once on its own app: the fixture's rules can go live only once.
  beforeEach(async () => {
    fake = await writer();
    t = await createTestApp({
      AI_SERVICE_URL: fake.url,
      AI_SERVICE_TOKEN: AI_TOKEN,
      JOBS_POLL_SECONDS: "0.5",
    });
  });
  afterEach(async () => {
    await t.close();
    await fake.close();
  });

  it("rewrites new flags' explanation and fix in both languages, checked, and keeps the standard wording", async () => {
    const { runId } = await runWithFlags(t);
    await settled(t, runId);
    const analyst = await signIn(t, EMAILS.analyst);
    const [{ id }]: Array<{ id: string }> = await t.dataSource.query(
      "SELECT id FROM flags WHERE run_id = $1 ORDER BY id LIMIT 1",
      [runId],
    );
    const { flag } = (await analyst.get(`/api/v1/flags/${id}`).expect(200)).body as FlagResponse;
    expect(flag.writing).toBe("done");
    expect(flag.textSources).toEqual({ en: "ai", ar: "ai" });
    expect(flag.explanationEn).toContain(flag.transactionIds[0] ?? "");
    expect(flag.explanationEn).not.toContain("[EMP_");
    // The token came back as the person's real ID.
    expect(flag.explanationEn).toContain(flag.people[0]?.id ?? "");
    expect(flag.standardExplanationEn).not.toBe(flag.explanationEn);
    expect(flag.timeline.map((event) => event.action)).toContain("flag.write");
    // No person's ID went to the AI service: only tokens.
    const sent = fake.received.filter((item) => item.path === "/v1/texts/explain");
    expect(sent.length).toBeGreaterThan(0);
    const [people]: Array<{ ids: string[] }> = await t.dataSource.query(
      "SELECT array_agg(DISTINCT p->>'id') AS ids FROM flags, jsonb_array_elements(people) AS p WHERE run_id = $1",
      [runId],
    );
    const body = JSON.stringify(sent.map((item) => item.body));
    for (const person of people?.ids ?? []) expect(body).not.toContain(person);
    expect(body).toContain("[EMP_1]");
  });

  it("keeps the standard wording in a language whose text failed the checks", async () => {
    fake.explain = (request) => ({
      en: {
        explanation: `${request.transactionId} broke ${request.rule.id}.`,
        fix: request.action.en,
      },
      ar: null,
      rejected: [
        {
          explanation: "نص خاطئ 17,000",
          fix: "-",
          attempt: 1,
          language: "ar",
          problem: "the explanation gives numbers the data doesn't: 17000",
        },
      ],
      verification: { explanation: 0.9, fix: 0.9, arabic: null },
    });
    const { runId } = await runWithFlags(t);
    await settled(t, runId);
    const [flag]: Array<{
      id: string;
      explanation_source_en: string;
      explanation_source_ar: string;
      explanation_ar: string;
      standard_explanation_ar: string;
    }> = await t.dataSource.query(
      "SELECT id, explanation_source_en, explanation_source_ar, explanation_ar, standard_explanation_ar FROM flags WHERE run_id = $1 ORDER BY id LIMIT 1",
      [runId],
    );
    expect(flag?.explanation_source_en).toBe("ai");
    expect(flag?.explanation_source_ar).toBe("template");
    expect(flag?.explanation_ar).toBe(flag?.standard_explanation_ar);
    const [event]: Array<{ ai: { output: { rejected: unknown[] } } }> = await t.dataSource.query(
      "SELECT ai FROM audit_events WHERE object_id = $1 AND action = 'flag.write'",
      [flag?.id],
    );
    expect(event?.ai.output.rejected).toHaveLength(1);
  });

  it("leaves a flag the analyst decided before AI wrote alone", async () => {
    fake.holdTexts();
    const { runId } = await runWithFlags(t);
    const analyst = await signIn(t, EMAILS.analyst);
    const [{ id }]: Array<{ id: string }> = await t.dataSource.query(
      "SELECT id FROM flags WHERE run_id = $1 ORDER BY severity_rank DESC, id DESC LIMIT 1",
      [runId],
    );
    const before = ((await analyst.get(`/api/v1/flags/${id}`).expect(200)).body as FlagResponse)
      .flag;
    await analyst
      .post(`/api/v1/flags/${id}/dismiss`)
      .set(CSRF)
      .send({ rowVersion: before.rowVersion, reason: "false_alarm", note: "Checked by hand." })
      .expect(200);
    fake.releaseTexts();
    await settled(t, runId);
    const after = ((await analyst.get(`/api/v1/flags/${id}`).expect(200)).body as FlagResponse)
      .flag;
    expect(after.explanationEn).toBe(before.explanationEn);
    expect(after.writing).toBe("none");
  });

  it("doesn't change the row version, and a confirm with the standard fix isn't a change", async () => {
    const { runId, teams } = await runWithFlags(t);
    const analyst = await signIn(t, EMAILS.analyst);
    const [{ id, row_version: loaded }]: Array<{ id: string; row_version: number }> =
      await t.dataSource.query(
        "SELECT id, row_version FROM flags WHERE run_id = $1 AND owner_team_id IS NOT NULL ORDER BY id LIMIT 1",
        [runId],
      );
    await settled(t, runId);
    const { flag } = (await analyst.get(`/api/v1/flags/${id}`).expect(200)).body as FlagResponse;
    expect(flag.rowVersion).toBe(loaded);
    expect(flag.textSources.en).toBe("ai");
    // A page opened before AI wrote sends the version it loaded and the fix it showed.
    const confirmed = (
      await analyst
        .post(`/api/v1/flags/${id}/confirm`)
        .set(CSRF)
        .send({ rowVersion: loaded, ownerTeamId: teams.payroll, suggestedFix: flag.standardFixEn })
        .expect(200)
    ).body as FlagResponse;
    expect(
      confirmed.flag.decision?.changes.filter((change) => change.field === "suggested_fix"),
    ).toEqual([]);
  });
});

describe("when AI can't write", () => {
  it("without a text model, flags keep the standard wording and nothing is queued", async () => {
    const fake = await writer();
    fake.providers = { typesafe: true, textModel: false };
    const t = await createTestApp({
      AI_SERVICE_URL: fake.url,
      AI_SERVICE_TOKEN: AI_TOKEN,
      JOBS_POLL_SECONDS: "0.5",
    });
    try {
      const { runId } = await runWithFlags(t);
      const rows: Array<{ writing: string }> = await t.dataSource.query(
        "SELECT DISTINCT writing FROM flags WHERE run_id = $1",
        [runId],
      );
      expect(rows).toEqual([{ writing: "none" }]);
      expect(fake.received.some((item) => item.path === "/v1/texts/explain")).toBe(false);
    } finally {
      await t.close();
      await fake.close();
    }
  });

  it("a failing text model is tried again, then the flag says AI couldn't write it", async () => {
    const fake = await writer();
    fake.explain = () => "fail";
    const t = await createTestApp({
      AI_SERVICE_URL: fake.url,
      AI_SERVICE_TOKEN: AI_TOKEN,
      JOBS_POLL_SECONDS: "0.5",
      WRITE_RETRY_LIMIT: "0",
    });
    try {
      const { runId } = await runWithFlags(t);
      await settled(t, runId);
      const rows: Array<{ writing: string }> = await t.dataSource.query(
        "SELECT DISTINCT writing FROM flags WHERE run_id = $1",
        [runId],
      );
      expect(rows).toEqual([{ writing: "failed" }]);
      const [row]: Array<{ n: number }> = await t.dataSource.query(
        "SELECT count(*)::int AS n FROM audit_events WHERE action = 'flag.write_failed'",
      );
      expect(row?.n).toBeGreaterThan(0);
    } finally {
      await t.close();
      await fake.close();
    }
  });

  it("writes only the most severe flags beyond AI_WRITE_LIMIT", async () => {
    const fake = await writer();
    const t = await createTestApp({
      AI_SERVICE_URL: fake.url,
      AI_SERVICE_TOKEN: AI_TOKEN,
      JOBS_POLL_SECONDS: "0.5",
      AI_WRITE_LIMIT: "3",
    });
    try {
      const { runId } = await runWithFlags(t);
      await settled(t, runId);
      const rows: Array<{ writing: string; n: number; rank: number }> = await t.dataSource.query(
        "SELECT writing, count(*)::int AS n, min(severity_rank)::int AS rank FROM flags WHERE run_id = $1 GROUP BY writing ORDER BY writing",
        [runId],
      );
      const done = rows.find((row) => row.writing === "done");
      const none = rows.find((row) => row.writing === "none");
      expect(done?.n).toBe(3);
      expect(none?.n).toBeGreaterThan(0);
      expect(done?.rank).toBeLessThanOrEqual(none?.rank ?? 3);
    } finally {
      await t.close();
      await fake.close();
    }
  });
});
