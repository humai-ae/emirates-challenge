import { percent, type Score } from "./score.ts";

const HEADER = ["Rule", "Key", "Found", "TP", "FP", "FN", "Precision", "Recall"];

/** The score as a table: one line per rule, then all rules together. */
export function formatScore(score: Score): string {
  const lines = [...score.rules, score.overall].map((rule) => [
    rule.ruleId,
    String(rule.expected),
    String(rule.found),
    String(rule.truePositives),
    String(rule.falsePositives),
    String(rule.falseNegatives),
    percent(rule.precision),
    percent(rule.recall),
  ]);
  const widths = HEADER.map((title, column) =>
    Math.max(title.length, ...lines.map((line) => line[column]?.length ?? 0)),
  );
  const format = (cells: readonly string[]) =>
    cells
      .map((cell, column) =>
        column === 0 ? cell.padEnd(widths[column] ?? 0) : cell.padStart(widths[column] ?? 0),
      )
      .join("  ");
  const table = [format(HEADER), ...lines.map(format)].join("\n");
  return score.duplicates > 0
    ? `${table}\nRepeated findings, counted once: ${score.duplicates}`
    : table;
}
