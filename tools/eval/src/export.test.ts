import {
  explainFinding,
  type FindingRow,
  learnValues,
  proposeMapping,
  readCsv,
  renderFindingsCsv,
} from "@hrcc/engine";
import { generatePack } from "@hrcc/sample-data";
import { describe, expect, it } from "vitest";
import { evaluatePack } from "./evaluate-pack.ts";
import { SAMPLE_RULES } from "./sample-rules.ts";
import { belowGate, scoreFindings } from "./score.ts";

const encoder = new TextEncoder();

function table(text: string) {
  const read = readCsv(encoder.encode(text));
  if (!read.ok) throw new Error(`Unreadable CSV: ${read.reason}`);
  return read.table;
}

describe("exporting the findings", () => {
  it("writes the generated pack's findings in its own format, and they score perfectly", () => {
    const pack = generatePack({ seed: 7, employees: 60, transactions: 300 });
    const { runs } = evaluatePack({
      transactions: encoder.encode(pack.files["transactions.csv"]),
      employees: encoder.encode(pack.files["employees.csv"]),
    });
    const format = table(pack.files["finding_format.csv"]);
    const mapping = proposeMapping(format.header);
    const values = learnValues(format.rows, mapping);
    const rules = new Map(SAMPLE_RULES.map((rule) => [rule.ruleId, rule]));
    let findingNo = 0;
    const rows = runs.flatMap((run): FindingRow[] => {
      const rule = rules.get(run.ruleId);
      if (!rule) return [];
      return run.results
        .filter((result) => result.outcome === "flagged")
        .map((result) => ({
          findingNo: ++findingNo,
          transactionId: result.transactionId,
          ruleId: run.ruleId,
          ruleTitle: run.ruleId,
          severity: "High",
          description: explainFinding(rule.preset, result.evidence, rule.values, "en"),
          evidence: result.evidence,
          owner: "",
          recommendedAction: "",
          employeeId: null,
          transactionType: null,
          department: null,
          effectiveDate: null,
          amount: null,
          runId: "RUN-2026-10-16-01",
        }));
    });
    const exported = table(renderFindingsCsv(format.header, mapping, values, rows));
    expect(exported.header).toEqual(format.header);
    const column = (field: (typeof mapping)[number]) => mapping.indexOf(field);
    const pairs = exported.rows.map((row) => ({
      transactionId: row[column("transaction_id")] ?? "",
      ruleId: row[column("rule_id")] ?? "",
    }));
    const score = scoreFindings(pairs, pack.answerKey);
    expect(belowGate(score)).toEqual([]);
    expect(score.overall.precision).toBe(1);
    expect(score.overall.recall).toBe(1);
    for (const row of exported.rows) {
      expect(row[column("finding_id")]).toMatch(/^F-\d{4}$/);
      expect(row[column("description")]?.length).toBeGreaterThan(10);
    }
  });
});
