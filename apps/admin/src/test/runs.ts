import type { RunDetail, RunResult } from "@hrcc/shared";

export const RUN: RunDetail = {
  id: "RUN-2026-10-16-01",
  status: "complete",
  dataset: { id: "5d9b5c1e-3f0a-4c8e-9a71-2b6f4e8d1c30", name: "Training pack" },
  startedAt: "2026-10-16T08:00:00.000Z",
  startedBy: "Layla Haddad",
  finishedAt: "2026-10-16T08:00:00.412Z",
  totals: {
    transactions: 300,
    findings: 15,
    couldNotCheck: 2,
    waitingForAi: 0,
    durationMs: 412,
    newFlags: 0,
    seenAgain: 0,
  },
  rules: [
    {
      ruleId: "R-01",
      version: 1,
      title: "Approval of large allowance changes",
      preset: "approver_min_grade",
      severity: "High",
      ownerTeam: null,
      counts: {
        not_applicable: 212,
        passed: 81,
        flagged: 7,
        could_not_check: 0,
        needs_judgment: 0,
      },
      error: null,
    },
    {
      ruleId: "R-02",
      version: 1,
      title: "No self-approval",
      preset: "requester_not_approver",
      severity: "High",
      ownerTeam: null,
      counts: { not_applicable: 0, passed: 290, flagged: 8, could_not_check: 2, needs_judgment: 0 },
      error: null,
    },
  ],
};

export const FINDING: RunResult = {
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
  explanationEn:
    "The amount 16,200 is over 10,000, and no approver is grade 10 or above (approver grades: 8).",
  explanationAr:
    "المبلغ 16,200 أكثر من 10,000، ولا يوجد بين المعتمِدين من درجته 10 أو أعلى (درجات المعتمِدين: 8).",
};

export const UNCHECKED: RunResult = {
  seq: 9,
  ruleId: "R-02",
  ruleVersion: 1,
  rowNo: 12,
  transactionId: "TX-000012",
  outcome: "could_not_check",
  findingId: null,
  severity: "High",
  evidence: [],
  missing: [{ field: "approver_1_id", reason: "blank" }],
  error: null,
  explanationEn: null,
  explanationAr: null,
};
