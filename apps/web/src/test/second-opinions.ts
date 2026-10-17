import type { SecondOpinion, SecondOpinionDetail } from "@hrcc/shared";

/** A transaction the check passed that AI is sure breaks R-02. */
export const PASSED_OPINION: SecondOpinion = {
  id: "3a4b5c6d-7e8f-4a0b-9c1d-2e3f4a5b6c7d",
  runId: "RUN-2026-10-17-01",
  ruleId: "R-02",
  ruleVersion: 1,
  ruleTitle: "Requester is not the approver",
  transactionId: "TX-000041",
  rowNo: 41,
  code: "passed",
  pBreak: 0.95,
  enough: 0.9,
  strength: 0.95,
  noted: null,
  reviewRequested: null,
  flagId: null,
};

export function secondOpinion(overrides: Partial<SecondOpinion> = {}): SecondOpinion {
  return { ...PASSED_OPINION, ...overrides };
}

export function secondOpinionDetail(
  overrides: Partial<SecondOpinionDetail> = {},
): SecondOpinionDetail {
  return {
    ...PASSED_OPINION,
    ruleText: "The person who requests a transaction must not approve it.",
    transaction: [
      { column: "transaction_id", value: "TX-000041" },
      { column: "requester_id", value: "E-0007" },
      { column: "approver_1_id", value: "E-0007" },
    ],
    ...overrides,
  };
}
