import { generatePack, type PackOptions } from "@hrcc/sample-data";
import { describe, expect, it } from "vitest";
import { evaluatePack } from "./evaluate-pack.ts";
import { belowGate, scoreFindings } from "./score.ts";

const encoder = new TextEncoder();

function run(options: PackOptions) {
  const pack = generatePack(options);
  const result = evaluatePack({
    transactions: encoder.encode(pack.files["transactions.csv"]),
    employees: encoder.encode(pack.files["employees.csv"]),
  });
  return { result, score: scoreFindings(result.findings, pack.answerKey) };
}

describe("accuracy on the synthetic pack", () => {
  it("finds every planted break in the small pack, and nothing else", () => {
    const { score } = run({ seed: 7, employees: 60, transactions: 300 });
    expect(belowGate(score)).toEqual([]);
    expect(score.falseNegatives).toEqual([]);
    expect(score.falsePositives).toEqual([]);
  });

  it("meets the targets on a 3,000-transaction pack", { timeout: 60_000 }, () => {
    const { score } = run({ seed: 7, employees: 400, transactions: 3000 });
    expect(belowGate(score)).toEqual([]);
    expect(score.overall.precision).toBe(1);
    expect(score.overall.recall).toBe(1);
    for (const ruleId of [
      "R-01",
      "R-02",
      "R-03",
      "R-04",
      "R-05",
      "R-06",
      "R-09",
      "R-10",
      "R-11",
      "R-12",
      "R-13",
    ]) {
      const rule = score.rules.find((item) => item.ruleId === ruleId);
      expect(rule?.truePositives, ruleId).toBeGreaterThan(0);
    }
  });

  it("gives identical results on a second run", { timeout: 60_000 }, () => {
    const first = run({ seed: 7, employees: 400, transactions: 3000 }).result;
    const second = run({ seed: 7, employees: 400, transactions: 3000 }).result;
    expect(second.runs).toEqual(first.runs);
    expect(second.findings).toEqual(first.findings);
  });
});
