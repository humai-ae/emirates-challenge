import { describe, expect, it } from "vitest";
import {
  AI_CHECK_ERRORS,
  ConfirmMappingRequestSchema,
  RETRYABLE_AI_ERRORS,
  RunResponseSchema,
  RunResultsQuerySchema,
  RunResultsResponseSchema,
  RunTotalsSchema,
} from "./index.js";

const counts = {
  not_applicable: 212,
  passed: 81,
  flagged: 7,
  could_not_check: 0,
  needs_judgment: 0,
};

const run = {
  id: "RUN-2026-10-16-01",
  status: "complete",
  dataset: { id: "5d9b5c1e-3f0a-4c8e-9a71-2b6f4e8d1c30", name: "Training pack" },
  startedAt: "2026-10-16T08:00:00.000Z",
  startedBy: "Layla Haddad",
  finishedAt: "2026-10-16T08:00:01.000Z",
  totals: { transactions: 300, findings: 7, couldNotCheck: 0, waitingForAi: 0, durationMs: 412 },
  rules: [
    {
      ruleId: "R-01",
      version: 1,
      title: "Approval of large allowance changes",
      preset: "approver_min_grade",
      severity: "High",
      ownerTeam: null,
      counts,
      error: null,
    },
  ],
};

describe("runs", () => {
  it("reads a run with its rules, worked examples and export readiness", () => {
    const parsed = RunResponseSchema.safeParse({
      run,
      workedExamples: [{ row: 1, transactionId: "TX-000004", ruleId: "R-01", result: "found" }],
      exportReady: true,
    });
    expect(parsed.success).toBe(true);
    expect(
      RunResponseSchema.safeParse({
        run: { ...run, status: "running" },
        workedExamples: null,
        exportReady: false,
      }).success,
    ).toBe(false);
  });

  it("reads a page of results", () => {
    const result = {
      seq: 1,
      ruleId: "R-01",
      ruleVersion: 1,
      rowNo: 4,
      transactionId: "TX-000004",
      outcome: "flagged",
      findingId: "F-0001",
      severity: "High",
      evidence: [{ field: "amount", value: "16200", condition: "> 10000" }],
      missing: [],
      error: null,
      explanationEn: "The amount 16,200 is over 10,000.",
      explanationAr: "المبلغ 16,200 أكثر من 10,000.",
    };
    expect(RunResultsResponseSchema.safeParse({ results: [result], nextAfter: 1 }).success).toBe(
      true,
    );
    expect(
      RunResultsResponseSchema.safeParse({
        results: [{ ...result, outcome: "passed" }],
        nextAfter: null,
      }).success,
    ).toBe(false);
  });

  it("reads the results query from the URL, with defaults", () => {
    expect(RunResultsQuerySchema.parse({})).toEqual({ outcome: "flagged", limit: 50 });
    expect(
      RunResultsQuerySchema.parse({ outcome: "could_not_check", after: "50", limit: "20" }),
    ).toEqual({
      outcome: "could_not_check",
      after: 50,
      limit: 20,
    });
    expect(RunResultsQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
  });

  it("needs Transaction ID and Rule ID, each field once", () => {
    const mapping = ["finding_id", "transaction_id", "rule_id", null];
    expect(ConfirmMappingRequestSchema.safeParse({ rowVersion: 1, mapping }).success).toBe(true);
    const incomplete = ConfirmMappingRequestSchema.safeParse({
      rowVersion: 1,
      mapping: ["finding_id", "transaction_id", null],
    });
    expect(incomplete.error?.issues[0]?.message).toBe("mapping_incomplete");
    const reused = ConfirmMappingRequestSchema.safeParse({
      rowVersion: 1,
      mapping: ["transaction_id", "rule_id", "rule_id"],
    });
    expect(reused.error?.issues[0]?.message).toBe("field_reused");
  });
});

describe("AI checks in run totals", () => {
  it("reads older runs as having no AI failures", () => {
    const totals = RunTotalsSchema.parse({
      transactions: 10,
      findings: 2,
      couldNotCheck: 1,
      waitingForAi: 0,
      durationMs: 40,
    });
    expect(totals.aiFailed).toBe(0);
  });

  it("retries the AI errors a later attempt can fix, not a text without enough information", () => {
    expect(AI_CHECK_ERRORS).toContain("ai_not_enough_information");
    expect(RETRYABLE_AI_ERRORS).toEqual(["ai_check_failed", "ai_not_set_up"]);
  });
});
