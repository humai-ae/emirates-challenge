import { describe, expect, it } from "vitest";
import { extractCandidates } from "./candidates.js";

const NONE = { types: [], documents: [] };

describe("extractCandidates", () => {
  it("finds amounts, with or without a currency", () => {
    expect(
      extractCandidates("Allowance changes above AED 10,000, or over 5,000 dirhams.", NONE).amounts,
    ).toEqual([
      { value: 10000, currency: "AED" },
      { value: 5000, currency: "AED" },
    ]);
    expect(extractCandidates("Overtime above 4,500 is not allowed.", NONE).amounts).toEqual([
      { value: 4500, currency: null },
    ]);
    expect(extractCandidates("Up to AED2500.50 a month.", NONE).amounts).toEqual([
      { value: 2500.5, currency: "AED" },
    ]);
  });

  it("finds grades", () => {
    expect(
      extractCandidates(
        "Approved by an approver at Grade 10 or above, or grade 12 above that.",
        NONE,
      ).grades,
    ).toEqual([10, 12]);
  });

  it("reads durations as days", () => {
    const text =
      "Within 30 days, in any 12-month period, within 5 working days, two weeks, one year or 6 months.";
    expect(extractCandidates(text, NONE).durations).toEqual([
      { days: 30, working: false },
      { days: 365, working: false },
      { days: 5, working: true },
      { days: 14, working: false },
      { days: 365, working: false },
      { days: 183, working: false },
    ]);
  });

  it("finds counts", () => {
    expect(
      extractCandidates(
        "At most 2 allowance changes; no more than three overtime claims; up to 10 transfers.",
        NONE,
      ).counts,
    ).toEqual([2, 3, 10]);
  });

  it("doesn't take a number of days for a count", () => {
    const found = extractCandidates(
      "Transactions must not be submitted more than 30 days after their effective date.",
      NONE,
    );
    expect(found.counts).toEqual([]);
    expect(found.durations).toEqual([{ days: 30, working: false }]);
  });

  it("names the dataset's types and documents as words, in text order", () => {
    const vocabulary = {
      types: ["pay_change", "allowance_change", "exit"],
      documents: ["clearance_form", "resignation_letter"],
    };
    const exit = extractCandidates(
      "Every exit must have a resignation letter and a clearance form attached.",
      vocabulary,
    );
    expect(exit.types).toEqual(["exit"]);
    expect(exit.documents).toEqual(["resignation_letter", "clearance_form"]);
    expect(extractCandidates("Allowance changes and pay changes", vocabulary).types).toEqual([
      "allowance_change",
      "pay_change",
    ]);
    expect(
      extractCandidates("Transactions must be submitted within 30 days.", vocabulary).types,
    ).toEqual([]);
  });

  it("finds percentages", () => {
    expect(
      extractCandidates("A raise of more than 20% needs a second approver.", NONE).percentages,
    ).toEqual([20]);
  });
});
