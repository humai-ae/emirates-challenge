import type { RulesListResponse, RunResponse } from "@hrcc/shared";
import { describe, expect, it } from "vitest";
import { AI_TOKEN, type FakeAi, startFakeAi } from "./fake-ai.js";
import { type Agent, approve, EMAILS } from "./flags-setup.js";
import { fixture, uploadPack } from "./packs.js";
import { CSRF, createTestApp, signIn, type TestApp } from "./test-app.js";
import { waitFor } from "./wait.js";

/** The pack's transactions, changed row by row; cells by column name. */
function packWith(change: (row: Record<string, string>) => Record<string, string>): Buffer {
  const [head = "", ...lines] = fixture("transactions.csv").toString("utf8").trimEnd().split("\n");
  const columns = head.split(",");
  const rows = lines.map((line) => {
    const cells = line.split(",");
    const row = Object.fromEntries(columns.map((name, index) => [name, cells[index] ?? ""]));
    return columns.map((name) => change(row)[name] ?? "").join(",");
  });
  return Buffer.from(`${[head, ...rows].join("\n")}\n`, "utf8");
}

/** The pack loaded and its policy drafted, the given rules approved, and one run started. */
async function runWith(
  t: TestApp,
  live: readonly string[],
  transactions?: Buffer,
): Promise<{ admin: Agent; run: RunResponse["run"] }> {
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
  for (const id of live) await approve(admin, id);
  const { run } = (await admin.post("/api/v1/runs").set(CSRF).send({}).expect(201))
    .body as RunResponse;
  return { admin, run };
}

/** The run once its patterns are found. */
async function found(admin: Agent, runId: string): Promise<RunResponse["run"]> {
  await waitFor(async () => {
    const { run } = (await admin.get(`/api/v1/runs/${runId}`).expect(200)).body as RunResponse;
    return !run.totals.findingPatterns;
  });
  return ((await admin.get(`/api/v1/runs/${runId}`).expect(200)).body as RunResponse).run;
}

const patternFlags = (t: TestApp, runId: string) =>
  t.dataSource.query(
    "SELECT rule_id, confidence, severity, pattern FROM flags WHERE run_id = $1 AND kind = 'unusual_pattern' ORDER BY id",
    [runId],
  ) as Promise<
    Array<{
      rule_id: string;
      confidence: string;
      severity: string;
      pattern: { subject: string; concern: number | null; combined: number };
    }>
  >;

const auditOf = async (t: TestApp, runId: string) => {
  const [event]: Array<{ after: Record<string, unknown>; ai: unknown }> = await t.dataSource.query(
    "SELECT after, ai FROM audit_events WHERE action = 'run.patterns' AND object_id = $1",
    [runId],
  );
  return event;
};

/**
 * Two allowance changes for TX-000002's employee within three days, each under R-01's 10,000
 * limit and 11,000 together, with one reason: a split request.
 */
function withSplit(): Buffer {
  let employee = "";
  return packWith((row) => {
    if (row.transaction_id === "TX-000002") employee = row.employee_id ?? "";
    if (row.transaction_id === "TX-000002" || row.transaction_id === "TX-000003") {
      const first = row.transaction_id === "TX-000002";
      return {
        ...row,
        type: "allowance_change",
        employee_id: employee,
        amount: first ? "6000" : "5000",
        effective_date: first ? "2025-03-01" : "2025-03-03",
        justification: "Housing",
      };
    }
    return row;
  });
}

describe("unusual patterns after a run", () => {
  it("finds patterns in the run without AI, ranked by code", async () => {
    const t = await createTestApp();
    try {
      // Only R-01 is live, so nothing flags TX-000171: the pack's one exit in Cargo.
      const { run } = await runWith(t, ["R-01"]);
      expect(run.totals.findingPatterns).toBe(false);
      expect(run.totals.patterns).toBe(1);
      const flags = await patternFlags(t, run.id);
      expect(flags.map((flag) => [flag.rule_id, flag.pattern.subject])).toEqual([
        ["PAT-5", "TX-000171"],
      ]);
      expect(flags[0]?.pattern.concern).toBeNull();
      const audit = await auditOf(t, run.id);
      expect(audit?.after).toMatchObject({ candidates: 1, patterns: 1, newFlags: 1, byJev: false });
    } finally {
      await t.close();
    }
  });

  it("finds nothing in a dataset without patterns, and says so", async () => {
    const t = await createTestApp();
    try {
      const plain = packWith((row) =>
        row.transaction_id === "TX-000171" ? { ...row, type: "overtime" } : row,
      );
      const { run } = await runWith(t, ["R-01"], plain);
      expect(run.totals.patterns).toBe(0);
      expect(await patternFlags(t, run.id)).toEqual([]);
      expect((await auditOf(t, run.id))?.after).toMatchObject({ candidates: 0, patterns: 0 });
    } finally {
      await t.close();
    }
  });

  describe("with Jev", () => {
    async function app(fake: FakeAi, env: Record<string, string> = {}) {
      return createTestApp({
        AI_SERVICE_URL: fake.url,
        AI_SERVICE_TOKEN: AI_TOKEN,
        JOBS_POLL_SECONDS: "0.5",
        ...env,
      });
    }
    const sentTo = (fake: FakeAi, path: string) =>
      fake.received.filter((item) => item.path === path);

    it("ranks patterns with Jev after the run, and stops looking when done", async () => {
      const fake = await startFakeAi();
      fake.providers = { typesafe: true, textModel: false };
      fake.rank = (request) =>
        request.candidates.map((candidate) => ({
          key: candidate.key,
          concern: 0.9,
          probabilities: { benign: 0.05, worth_a_look: 0.15, likely_issue: 0.8 },
        }));
      const t = await app(fake);
      try {
        const { admin, run } = await runWith(t, ["R-01"]);
        expect(run.totals.findingPatterns).toBe(true);
        const done = await found(admin, run.id);
        expect(done.totals.patterns).toBe(1);
        const [flag] = await patternFlags(t, run.id);
        expect(flag?.pattern.concern).toBe(0.9);
        // Code's 0.59 averaged with Jev's 0.9: High confidence, so a Medium flag.
        expect(flag).toMatchObject({ confidence: "High", severity: "Medium" });
        expect(sentTo(fake, "/v1/patterns/rank")).toHaveLength(1);
        expect((await auditOf(t, run.id))?.after).toMatchObject({ byJev: true });
      } finally {
        await t.close();
        await fake.close();
      }
    });

    it("ranks with people as tokens", async () => {
      const fake = await startFakeAi();
      fake.providers = { typesafe: true, textModel: false };
      const t = await app(fake);
      try {
        const { admin, run } = await runWith(t, ["R-01"], withSplit());
        await found(admin, run.id);
        const [request] = sentTo(fake, "/v1/patterns/rank");
        const candidates = request?.body.candidates as Array<{
          detector: string;
          facts: Array<{ key: string; value: string | number }>;
        }>;
        const split = candidates.find((candidate) => candidate.detector === "split_requests");
        const employee = split?.facts.find((fact) => fact.key === "employee")?.value;
        expect(employee).toMatch(/^\[EMP_\d+\]$/);
        // No employee ID anywhere in what AI reads.
        const ids: Array<{ employee_id: string }> = await t.dataSource.query(
          "SELECT DISTINCT employee_id FROM employees",
        );
        const sent = JSON.stringify(request?.body);
        expect(ids.filter((row) => sent.includes(row.employee_id))).toEqual([]);
      } finally {
        await t.close();
        await fake.close();
      }
    });

    it("falls back to code when Jev keeps failing", async () => {
      const fake = await startFakeAi();
      fake.providers = { typesafe: true, textModel: false };
      fake.rank = () => "fail";
      const t = await app(fake, { PATTERN_RETRY_LIMIT: "0" });
      try {
        const { admin, run } = await runWith(t, ["R-01"]);
        const done = await found(admin, run.id);
        expect(done.totals.patterns).toBe(1);
        const [flag] = await patternFlags(t, run.id);
        expect(flag?.pattern.concern).toBeNull();
        expect((await auditOf(t, run.id))?.after).toMatchObject({ byJev: false });
      } finally {
        await t.close();
        await fake.close();
      }
    });
  });
});
