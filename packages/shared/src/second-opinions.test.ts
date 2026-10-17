import { describe, expect, it } from "vitest";
import {
  AiSecondOpinionRequestSchema,
  AiSecondOpinionResponseSchema,
  SECOND_OPINION_QUESTION_SET,
  SecondOpinionSchema,
} from "./index.js";

const transaction = {
  key: "row-12",
  rules: [0],
  fields: [
    { name: "amount", value: "16200" },
    { name: "approver_grades", value: ["8"] },
  ],
  gaps: [{ name: "approved_after_effective", days: -3 }],
};

describe("second opinions", () => {
  it("asks Jev about at most ten transactions", () => {
    const request = {
      rules: [{ id: "R-01", text: "Allowance changes above AED 10,000 need a Grade 10 approver." }],
      transactions: [transaction],
    };
    expect(AiSecondOpinionRequestSchema.safeParse(request).success).toBe(true);
    const many = Array.from({ length: 11 }, (_, index) => ({
      ...transaction,
      key: `row-${index}`,
    }));
    expect(AiSecondOpinionRequestSchema.safeParse({ ...request, transactions: many }).success).toBe(
      false,
    );
    // Whole rows never go: only named fields.
    expect(
      AiSecondOpinionRequestSchema.safeParse({
        ...request,
        transactions: [{ ...transaction, cells: { amount: "16200" } }],
      }).success,
    ).toBe(false);
    const provenance = {
      provider: "typesafe",
      model: "jev-1.14.0",
      version: SECOND_OPINION_QUESTION_SET,
      inputSha256: "a".repeat(64),
      latencyMs: 700,
    };
    expect(
      AiSecondOpinionResponseSchema.safeParse({
        answers: [{ key: "row-12", rule: "R-01", pBreak: 0.93 }],
        enough: [{ key: "row-12", p: 0.9 }],
        provenance,
      }).success,
    ).toBe(true);
  });

  it("keeps a second opinion's numbers between 0 and 1", () => {
    const opinion = {
      id: "5b0c7f1e-2a3d-4c5e-8f90-1a2b3c4d5e6f",
      runId: "RUN-2026-10-17-01",
      ruleId: "R-01",
      ruleVersion: 1,
      ruleTitle: "Approval of large allowance changes",
      transactionId: "TX-000006",
      rowNo: 7,
      code: "passed",
      pBreak: 0.93,
      enough: 0.9,
      strength: 0.93,
      noted: null,
      reviewRequested: null,
      flagId: null,
    };
    expect(SecondOpinionSchema.safeParse(opinion).success).toBe(true);
    expect(SecondOpinionSchema.safeParse({ ...opinion, pBreak: 1.2 }).success).toBe(false);
  });
});
