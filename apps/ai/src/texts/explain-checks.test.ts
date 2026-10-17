import type { AiExplainRequest } from "@hrcc/shared";
import { describe, expect, it } from "vitest";
import { problemsWith } from "./explain-checks.js";

const request: AiExplainRequest = {
  kind: "rule_break",
  rule: {
    id: "R-01",
    title: "Approval of large allowance changes",
    text: "Allowance changes above AED 10,000 need an approver at Grade 10 or above.",
  },
  transactionId: "TX-000006",
  evidence: [
    { field: "amount", value: "16200", condition: "> 10000" },
    { field: "approver_grades", value: ["8"], condition: "max must be >= 10" },
  ],
  severity: "High",
  team: "Payroll & Compensation",
  action: {
    en: "Get approval from a Grade 10 approver, or reverse the change.",
    ar: "احصل على اعتماد من معتمِد في الدرجة 10، أو ألغِ التغيير.",
  },
  standard: { en: "The amount 16,200 is over 10,000.", ar: "المبلغ 16,200 أكثر من 10,000." },
  judgment: null,
  people: ["[EMP_1]"],
};

const good = {
  explanation:
    "TX-000006 for [EMP_1] broke R-01: the amount 16,200 is over 10,000, and the only approver_grades value is 8, below Grade 10.",
  fix: "Get approval from a Grade 10 approver for TX-000006, or reverse the change.",
};

describe("checking an AI text against the flag's data", () => {
  it("accepts a text that only repeats the data", () => {
    expect(problemsWith(good, request)).toEqual([]);
  });

  it("finds numbers, fields and people the data doesn't have", () => {
    expect(problemsWith({ ...good, fix: "Reverse it within 5 days." }, request)).toEqual([
      "the fix gives numbers the data doesn't: 5",
    ]);
    expect(
      problemsWith(
        { ...good, explanation: `${good.explanation} The approver_2_grade is blank.` },
        request,
      ),
    ).toEqual(["the explanation names fields the data doesn't: approver_2_grade, and numbers: 2"]);
    expect(problemsWith({ ...good, fix: "Ask [EMP_2] to approve it." }, request)).toEqual([
      "the fix names people the data doesn't: [EMP_2]",
    ]);
  });

  it("holds the explanation to 60 words and the fix to 300 characters", () => {
    expect(problemsWith({ ...good, explanation: "word ".repeat(61) }, request)).toEqual([
      "the explanation is longer than 60 words",
    ]);
    expect(problemsWith({ ...good, fix: "a".repeat(301) }, request)).toEqual([
      "the fix is longer than 300 characters",
    ]);
  });

  it("reads Arabic-Indic digits as the numbers they are", () => {
    expect(
      problemsWith({ ...good, explanation: "المبلغ ١٦٬٢٠٠ أكثر من ١٠٬٠٠٠." }, request),
    ).toEqual([]);
    expect(problemsWith({ ...good, explanation: "المبلغ ١٧٬٠٠٠." }, request)).toEqual([
      "the explanation gives numbers the data doesn't: 17000",
    ]);
  });
});
