import { LOCALES, PATTERN_DETECTORS, type PatternDetector, type PatternFact } from "@hrcc/shared";
import { describe, expect, it } from "vitest";
import {
  explainPattern,
  patternDescription,
  patternFollowUp,
  patternTitle,
} from "./pattern-texts.js";

/** Facts like those each detector gives. */
const FACTS: Record<PatternDetector, PatternFact[]> = {
  just_under_limit: [
    { key: "rule", value: "R-01" },
    { key: "limit", value: 10_000 },
    { key: "requester", value: "E-0003" },
    { key: "near_limit", value: 6 },
    { key: "of", value: 8 },
    { key: "share_pct", value: 75 },
    { key: "everyone_pct", value: 18.4 },
  ],
  dominant_pair: [
    { key: "requester", value: "E-0006" },
    { key: "approver", value: "E-0002" },
    { key: "approved", value: 10 },
    { key: "of", value: 10 },
    { key: "share_pct", value: 100 },
    { key: "in_reporting_line", value: "no" },
  ],
  off_hours_approvals: [
    { key: "department", value: "Finance" },
    { key: "off_hours", value: 18 },
    { key: "of", value: 30 },
    { key: "team_pct", value: 60 },
    { key: "everyone_pct", value: 28.6 },
  ],
  backdating: [
    { key: "transaction", value: "TX-LATE" },
    { key: "department", value: "Finance" },
    { key: "days_late", value: 60 },
    { key: "team_median_days", value: 3.5 },
  ],
  rare_type: [
    { key: "type", value: "transfer" },
    { key: "department", value: "Finance" },
    { key: "count", value: 1 },
    { key: "of", value: 60 },
    { key: "elsewhere_pct", value: 33.3 },
  ],
  split_requests: [
    { key: "rule", value: "R-01" },
    { key: "limit", value: 10_000 },
    { key: "employee", value: "E-0004" },
    { key: "count", value: 3 },
    { key: "total", value: 11_500 },
    { key: "largest", value: 4_500 },
    { key: "window_days", value: 7 },
  ],
};

describe("pattern wording", () => {
  it("words every detector in English and Arabic from its facts", () => {
    for (const detector of PATTERN_DETECTORS) {
      for (const locale of LOCALES) {
        const text = explainPattern({ detector, facts: FACTS[detector] }, locale);
        expect(text, `${detector} ${locale}`).not.toMatch(/[{}]/);
        // Latin digits in both languages, numbers grouped.
        expect(text).not.toMatch(/[٠-٩]/);
        for (const label of [patternTitle, patternDescription, patternFollowUp]) {
          expect(label(detector, locale).length).toBeGreaterThan(10);
        }
      }
    }
    expect(
      explainPattern({ detector: "just_under_limit", facts: FACTS.just_under_limit }, "en"),
    ).toBe(
      "E-0003 made 6 of their 8 requests under R-01 at 90–100% of its 10,000 limit: 75%, against 18.4% for everyone.",
    );
    expect(
      explainPattern({ detector: "split_requests", facts: FACTS.split_requests }, "en"),
    ).toContain("11,500");
  });

  it("says whose transactions were approved off hours, not who approved them", () => {
    expect(
      explainPattern({ detector: "off_hours_approvals", facts: FACTS.off_hours_approvals }, "en"),
    ).toBe(
      "18 of the 30 approvals of Finance's transactions were outside working hours or on non-working days: 60%, against 28.6% for everyone.",
    );
  });

  it("compares a rare type with how common it is elsewhere", () => {
    const facts = [
      { key: "type", value: "transfer" },
      { key: "department", value: "Finance" },
      { key: "count", value: 1 },
      { key: "of", value: 60 },
      { key: "elsewhere_pct", value: 33.3 },
    ];
    expect(explainPattern({ detector: "rare_type", facts }, "en")).toBe(
      "Only 1 of the 60 transactions in Finance is transfer, against 33.3% of transactions elsewhere.",
    );
  });

  it("words a team that usually submits before the effective date", () => {
    const facts = FACTS.backdating.map((fact) =>
      fact.key === "team_median_days" ? { ...fact, value: -10 } : fact,
    );
    const en = explainPattern({ detector: "backdating", facts }, "en");
    expect(en).toContain("usually submits 10 days before");
    expect(en).not.toContain("-10");
    expect(explainPattern({ detector: "backdating", facts }, "ar")).not.toContain("-10");
  });

  it("leaves a missing fact as a dash rather than a gap", () => {
    const text = explainPattern({ detector: "backdating", facts: [] }, "en");
    expect(text).not.toMatch(/[{}]/);
    expect(text).toContain("—");
  });
});
