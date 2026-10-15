import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { evaluatePack } from "./evaluate-pack.ts";
import { readPairs, writePairs } from "./pairs.ts";
import { formatScore } from "./report.ts";
import { belowGate, DEFAULT_GATE, type Score, scoreFindings } from "./score.ts";

const [command, ...rest] = process.argv.slice(2).filter((arg) => arg !== "--");
const { values } = parseArgs({
  args: rest,
  options: {
    findings: { type: "string" },
    key: { type: "string" },
    pack: { type: "string" },
    out: { type: "string" },
    "min-precision": { type: "string", default: String(DEFAULT_GATE.minPrecision) },
    "min-recall": { type: "string", default: String(DEFAULT_GATE.minRecall) },
  },
});
const gate = {
  minPrecision: Number(values["min-precision"]),
  minRecall: Number(values["min-recall"]),
};

function report(score: Score): void {
  console.log(formatScore(score));
  const short = belowGate(score, gate);
  if (short.length > 0) {
    console.error(`Below target: ${short.join("; ")}`);
    process.exitCode = 1;
  }
}

if (command === "score" && values.findings && values.key) {
  report(
    scoreFindings(
      readPairs(readFileSync(values.findings), "findings"),
      readPairs(readFileSync(values.key), "answer key"),
    ),
  );
} else if (command === "sample" && values.pack) {
  const result = evaluatePack({
    transactions: readFileSync(join(values.pack, "transactions.csv")),
    employees: readFileSync(join(values.pack, "employees.csv")),
  });
  if (values.out) writeFileSync(values.out, writePairs(result.findings));
  report(
    scoreFindings(
      result.findings,
      readPairs(readFileSync(join(values.pack, "answer_key.csv")), "answer key"),
    ),
  );
} else {
  console.error(
    [
      "Usage:",
      "  eval score --findings <findings.csv> --key <answer_key.csv>",
      "  eval sample --pack <folder with transactions.csv, employees.csv, answer_key.csv> [--out findings.csv]",
      "Both take --min-precision (default 0.9) and --min-recall (default 0.95).",
    ].join("\n"),
  );
  process.exitCode = 2;
}
