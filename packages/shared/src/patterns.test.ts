import { describe, expect, it } from "vitest";
import {
  AiRankPatternsRequestSchema,
  AiRankPatternsResponseSchema,
  detectorOfCode,
  FlagPatternSchema,
  PATTERN_CODES,
  PATTERN_DETECTORS,
  PATTERN_QUESTION_SET,
  SeverityReasonSchema,
} from "./index.js";

const pattern = {
  detector: "just_under_limit",
  subject: "R01:E-1001",
  strength: 0.63,
  concern: 0.5,
  combined: 0.57,
  facts: [
    { key: "requester", value: "E-1001" },
    { key: "near_limit", value: 6 },
  ],
  transactions: [{ id: "TX-000012", rowNo: 13 }],
};

describe("unusual patterns", () => {
  it("names each pattern by a code and back", () => {
    expect(PATTERN_DETECTORS.map((detector) => PATTERN_CODES[detector])).toEqual([
      "PAT-1",
      "PAT-2",
      "PAT-3",
      "PAT-4",
      "PAT-5",
      "PAT-6",
    ]);
    for (const detector of PATTERN_DETECTORS) {
      expect(detectorOfCode(PATTERN_CODES[detector])).toBe(detector);
    }
    expect(detectorOfCode("R01")).toBeNull();
  });

  it("keeps a pattern's facts, scores and transactions on a flag", () => {
    expect(FlagPatternSchema.safeParse(pattern).success).toBe(true);
    // Ranked by code alone: no concern from Jev.
    expect(FlagPatternSchema.safeParse({ ...pattern, concern: null }).success).toBe(true);
    expect(FlagPatternSchema.safeParse({ ...pattern, strength: 1.2 }).success).toBe(false);
    expect(FlagPatternSchema.safeParse({ ...pattern, detector: "vibes" }).success).toBe(false);
    const many = Array.from({ length: 21 }, (_, index) => ({
      id: `TX-${index}`,
      rowNo: index + 1,
    }));
    expect(FlagPatternSchema.safeParse({ ...pattern, transactions: many }).success).toBe(false);
    expect(
      SeverityReasonSchema.safeParse({ code: "pattern_confidence", confidence: "High" }).success,
    ).toBe(true);
  });

  it("asks Jev to rank at most a batch of candidates", () => {
    const candidate = {
      key: "c1",
      detector: "rare_type",
      description: "A transaction type that is rare for the employee's department.",
      facts: [{ key: "type", value: "transfer" }],
    };
    expect(AiRankPatternsRequestSchema.safeParse({ candidates: [candidate] }).success).toBe(true);
    expect(AiRankPatternsRequestSchema.safeParse({ candidates: [] }).success).toBe(false);
    const many = Array.from({ length: 21 }, (_, index) => ({ ...candidate, key: `c${index}` }));
    expect(AiRankPatternsRequestSchema.safeParse({ candidates: many }).success).toBe(false);
    const rank = {
      key: "c1",
      concern: 0.75,
      probabilities: { benign: 0.1, worth_a_look: 0.3, likely_issue: 0.6 },
    };
    const provenance = {
      provider: "typesafe",
      model: "jev-1.14.0",
      version: PATTERN_QUESTION_SET,
      inputSha256: "a".repeat(64),
      latencyMs: 640,
    };
    expect(AiRankPatternsResponseSchema.safeParse({ ranks: [rank], provenance }).success).toBe(
      true,
    );
    expect(
      AiRankPatternsResponseSchema.safeParse({ ranks: [{ ...rank, concern: 2 }], provenance })
        .success,
    ).toBe(false);
  });
});
