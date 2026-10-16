import type { RunResponse, RunResult, RunResultsResponse } from "@hrcc/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixture, uploadPack } from "./packs.js";
import { CSRF, createTestApp, signIn, type TestApp } from "./test-app.js";

describe("run results", () => {
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

  const page = async (query: string) =>
    (await admin.get(`/api/v1/runs/${runId}/results?${query}`).expect(200))
      .body as RunResultsResponse;

  it("pages through the findings with their explanations", async () => {
    const seen: RunResult[] = [];
    let after: number | null = 0;
    while (after !== null) {
      const next = await page(`limit=5&after=${after}`);
      seen.push(...next.results);
      after = next.nextAfter;
    }
    expect(seen).toHaveLength(16);
    expect(seen.map((result) => result.findingId)).toEqual(
      Array.from({ length: 16 }, (_, index) => `F-${String(index + 1).padStart(4, "0")}`),
    );
    expect(seen[0]).toMatchObject({
      ruleId: "R-01",
      transactionId: "TX-000004",
      outcome: "flagged",
      severity: "High",
    });
    expect(seen[0]?.explanationEn).toMatch(
      /^The amount .* is over 10,000, and no approver is grade 10 or above/,
    );
    expect(seen[0]?.explanationAr).toMatch(/^المبلغ /);
    const r02 = await page("ruleId=R-02&limit=50");
    expect(r02.results).toHaveLength(8);
    expect(r02.nextAfter).toBeNull();
    expect(r02.results.every((result) => result.ruleId === "R-02")).toBe(true);
  });

  it("lists the transactions that couldn't be checked, with what was missing", async () => {
    const { results, nextAfter } = await page("outcome=could_not_check");
    expect(nextAfter).toBeNull();
    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result).toMatchObject({ ruleId: "R-02", findingId: null, explanationEn: null });
      expect(result.missing.length + (result.error ? 1 : 0)).toBeGreaterThan(0);
    }
    await admin.get(`/api/v1/runs/${runId}/results?outcome=passed`).expect(400);
  });
});
