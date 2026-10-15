import { describe, expect, it } from "vitest";
import { formatScore } from "./report.ts";
import { belowGate, scoreFindings } from "./score.ts";

const pair = (transactionId: string, ruleId: string) => ({ transactionId, ruleId });

describe("scoreFindings", () => {
  it("scores precision and recall per rule and overall", () => {
    const key = [pair("TX-1", "R-01"), pair("TX-2", "R-01"), pair("TX-3", "R-02")];
    const findings = [
      pair("TX-1", "R-01"),
      pair("TX-9", "R-01"),
      pair("TX-3", "R-02"),
      pair("TX-3", "R-02"),
    ];
    const score = scoreFindings(findings, key);
    expect(score.rules).toEqual([
      {
        ruleId: "R-01",
        expected: 2,
        found: 2,
        truePositives: 1,
        falsePositives: 1,
        falseNegatives: 1,
        precision: 0.5,
        recall: 0.5,
      },
      {
        ruleId: "R-02",
        expected: 1,
        found: 1,
        truePositives: 1,
        falsePositives: 0,
        falseNegatives: 0,
        precision: 1,
        recall: 1,
      },
    ]);
    expect(score.overall).toMatchObject({
      ruleId: "All",
      expected: 3,
      found: 3,
      truePositives: 2,
      precision: 2 / 3,
      recall: 2 / 3,
    });
    expect(score.falsePositives).toEqual([pair("TX-9", "R-01")]);
    expect(score.falseNegatives).toEqual([pair("TX-2", "R-01")]);
    expect(score.duplicates).toBe(1);
  });

  it("leaves a rate empty when there is nothing to divide by", () => {
    const score = scoreFindings([pair("TX-1", "R-08")], [pair("TX-2", "R-07")]);
    expect(score.rules.map((rule) => [rule.ruleId, rule.precision, rule.recall])).toEqual([
      ["R-07", null, 0],
      ["R-08", 0, null],
    ]);
  });

  it("names the rules below the targets and prints a table", () => {
    const score = scoreFindings(
      [pair("TX-1", "R-01")],
      [pair("TX-1", "R-01"), pair("TX-2", "R-01")],
    );
    expect(belowGate(score)).toEqual(["R-01 recall 50.0%"]);
    const table = formatScore(score).split("\n");
    expect(table[0]).toMatch(/^Rule +Key +Found +TP +FP +FN +Precision +Recall$/);
    expect(table[1]).toMatch(/^R-01 +2 +1 +1 +0 +1 +100\.0% +50\.0%$/);
    expect(table[2]).toMatch(/^All /);
  });
});
