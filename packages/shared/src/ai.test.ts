import { describe, expect, it } from "vitest";
import {
  AiDraftRuleRequestSchema,
  AiDraftRuleResponseSchema,
  AiExplainRequestSchema,
  AiExplainResponseSchema,
  AiJudgeRequestSchema,
  AiJudgeResponseSchema,
  AiRestateRequestSchema,
  AiRestateResponseSchema,
  AiRuleActionResponseSchema,
  CONCRETE_KINDS,
  JUDGE_BATCH_SIZE,
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

const judgeRequest = {
  rule: {
    id: "R-07",
    text: "Justifications for pay changes above AED 5,000 must give a clear business reason.",
  },
  items: [
    {
      key: "a".repeat(64),
      field: "justification",
      text: "as discussed",
      type: "pay_change",
      amountBand: "5,000 to 10,000",
    },
  ],
};

const explainRequest = {
  kind: "rule_break",
  rule: {
    id: "R-01",
    title: "Approval of large allowance changes",
    text: "Allowance changes above AED 10,000 need a Grade 10 approver.",
  },
  transactionId: "TX-000006",
  evidence: [{ field: "amount", value: "16200", condition: "> 10000" }],
  severity: "High",
  team: "Payroll & Compensation",
  action: {
    en: "Get approval from a Grade 10 approver.",
    ar: "احصل على اعتماد من معتمِد في الدرجة 10.",
  },
  standard: { en: "The amount 16,200 is over 10,000.", ar: "المبلغ 16,200 أكثر من 10,000." },
  judgment: null,
  people: ["[EMP_1]"],
};

describe("AI judgment and explanation contracts", () => {
  it("sends a judgment only the rule, the text and its context, at most a batch at a time", () => {
    expect(AiJudgeRequestSchema.safeParse(judgeRequest).success).toBe(true);
    const [item] = judgeRequest.items;
    expect(
      AiJudgeRequestSchema.safeParse({
        ...judgeRequest,
        items: [{ ...item, employeeId: "E-1182" }],
      }).success,
    ).toBe(false);
    const many = Array.from({ length: JUDGE_BATCH_SIZE + 1 }, () => item);
    expect(AiJudgeRequestSchema.safeParse({ ...judgeRequest, items: many }).success).toBe(false);
  });

  it("reads Jev's four answers about each text", () => {
    const answer = { key: "k", specific: 0.1, placeholder: 0.9, accept: 0.05, enough: 0.95 };
    expect(AiJudgeResponseSchema.safeParse({ answers: [answer], provenance }).success).toBe(true);
    expect(
      AiJudgeResponseSchema.safeParse({ answers: [{ ...answer, accept: 1.2 }], provenance })
        .success,
    ).toBe(false);
  });

  it("names people only by token in an explanation request", () => {
    expect(AiExplainRequestSchema.safeParse(explainRequest).success).toBe(true);
    expect(
      AiExplainRequestSchema.safeParse({ ...explainRequest, people: ["E-1182"] }).success,
    ).toBe(false);
    expect(
      AiExplainRequestSchema.safeParse({
        ...explainRequest,
        transaction: [{ column: "amount" }],
      }).success,
    ).toBe(false);
  });

  it("returns each language's texts or null, with the rejected texts and Jev's checks", () => {
    const written = { explanation: "TX-000006 broke R-01.", fix: "Get approval." };
    const response = {
      en: written,
      ar: null,
      rejected: [{ ...written, attempt: 1, language: "ar", problem: "too long" }],
      verification: { explanation: 0.93, fix: 0.88, arabic: null },
      provenance: { ...provenance, provider: "text_model", version: "explain-v1" },
    };
    expect(AiExplainResponseSchema.safeParse(response).success).toBe(true);
  });
});

describe("the one-time restatement and the admin's criteria", () => {
  const criteria = { meets: ["Names a concrete reason."], doesNotMeet: ["A placeholder."] };
  const [item] = judgeRequest.items;

  it("sends Jev the rule's criteria and a text's restatement when there are some", () => {
    const parsed = AiJudgeRequestSchema.parse({
      ...judgeRequest,
      rule: { ...judgeRequest.rule, criteria },
      items: [
        {
          ...item,
          clarification: { restated: "A cost-of-living adjustment.", kind: "cost_of_living" },
        },
      ],
    });
    expect(parsed.rule.criteria).toEqual(criteria);
    expect(parsed.items[0]?.clarification?.kind).toBe("cost_of_living");
    expect(AiJudgeRequestSchema.parse(judgeRequest).rule.criteria).toBeNull();
    expect(AiJudgeRequestSchema.parse(judgeRequest).items[0]?.clarification).toBeNull();
    expect(
      AiJudgeRequestSchema.safeParse({
        ...judgeRequest,
        items: [{ ...item, clarification: { restated: "x", kind: "vibes" } }],
      }).success,
    ).toBe(false);
  });

  it("asks the text model to restate at most a batch of texts, and reads each kind", () => {
    const request = {
      rule: { id: "R-07", text: "Must give a clear business reason." },
      items: [{ key: "k", field: "justification", text: "COLA 2026" }],
    };
    expect(AiRestateRequestSchema.safeParse(request).success).toBe(true);
    const many = Array.from({ length: 21 }, (_, index) => ({
      ...request.items[0],
      key: `k${index}`,
    }));
    expect(AiRestateRequestSchema.safeParse({ ...request, items: many }).success).toBe(false);
    const answer = {
      items: [
        { key: "k", restated: "A cost-of-living adjustment for 2026.", kind: "cost_of_living" },
      ],
      provenance: { ...provenance, provider: "text_model", version: "restate-v1" },
    };
    expect(AiRestateResponseSchema.safeParse(answer).success).toBe(true);
    const long = { key: "k", restated: "x".repeat(401), kind: "cost_of_living" };
    expect(AiRestateResponseSchema.safeParse({ ...answer, items: [long] }).success).toBe(false);
    expect(CONCRETE_KINDS).not.toContain("unclear");
    expect(CONCRETE_KINDS).not.toContain("none");
  });
});
