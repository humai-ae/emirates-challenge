import { describe, expect, it } from "vitest";
import {
  AiDraftRuleRequestSchema,
  AiDraftRuleResponseSchema,
  AiRuleActionResponseSchema,
} from "./index.js";

const request = {
  text: "Allowance changes above AED 10,000 must be approved by at least one approver at Grade 10 or above.",
  columns: [{ name: "amount", type: "integer", role: "amount" }],
  candidates: { amounts: [10000], grades: [10], days: [], counts: [] },
  vocabulary: { types: ["allowance_change"], documents: [] },
};

const provenance = {
  provider: "typesafe",
  model: "jev-1.13.0",
  version: "rule-draft-v1",
  inputSha256: "a".repeat(64),
  latencyMs: 812,
};

describe("AI contracts", () => {
  it("refuses a draft request carrying rows or samples", () => {
    expect(AiDraftRuleRequestSchema.safeParse(request).success).toBe(true);
    expect(
      AiDraftRuleRequestSchema.safeParse({ ...request, rows: [{ amount: "16200" }] }).success,
    ).toBe(false);
    expect(
      AiDraftRuleRequestSchema.safeParse({
        ...request,
        columns: [{ name: "amount", type: "integer", role: "amount", samples: ["16200"] }],
      }).success,
    ).toBe(false);
    const types = Array.from({ length: 51 }, (_, index) => `type_${index}`);
    expect(
      AiDraftRuleRequestSchema.safeParse({ ...request, vocabulary: { types, documents: [] } })
        .success,
    ).toBe(false);
  });

  it("reads a draft answer: both check-type orders and the values picked", () => {
    const answer = AiDraftRuleResponseSchema.parse({
      presets: [
        { approver_min_grade: 0.91, none_fits: 0.02 },
        { approver_min_grade: 0.84, none_fits: 0.03 },
      ],
      amount: { value: 10000, probability: 0.97 },
      grade: { value: 10, probability: 0.95 },
      days: { value: null, probability: 0.99 },
      count: { value: null, probability: 0.99 },
      operator: { value: ">", probability: 0.8 },
      per: { value: "employee", probability: 0.7 },
      approver: { value: "any", probability: 0.6 },
      reach: { value: "reporting_line", probability: 0.6 },
      numberField: { value: "amount", probability: 0.9 },
      textField: { value: null, probability: 1 },
      anyField: { value: null, probability: 0.6 },
      everyType: 0.04,
      sameAmount: 0.1,
      requesterToo: 0.1,
      types: { allowance_change: 0.98 },
      documents: {},
      severity: { value: "High", probability: 0.88 },
      provenance,
    });
    expect(answer.presets[1].approver_min_grade).toBe(0.84);
    expect(answer.amount.value).toBe(10000);
  });

  it("keeps a suggested action within 300 characters in each language", () => {
    const action = {
      en: "Get Grade 10 approval.",
      ar: "احصل على اعتماد من الدرجة 10.",
      provenance,
    };
    expect(AiRuleActionResponseSchema.safeParse(action).success).toBe(true);
    expect(AiRuleActionResponseSchema.safeParse({ ...action, en: "x".repeat(301) }).success).toBe(
      false,
    );
  });
});
