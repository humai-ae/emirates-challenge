import { readCsv } from "@hrcc/engine";

/** One finding: a transaction and the rule it breaks. */
export interface Pair {
  transactionId: string;
  ruleId: string;
}

const TRANSACTION_HEADERS: ReadonlySet<string> = new Set([
  "transaction_id",
  "transaction",
  "transaction_ref",
  "tx_id",
  "txn_id",
]);
const RULE_HEADERS: ReadonlySet<string> = new Set(["rule_id", "rule", "policy_rule", "rule_ref"]);
const UNREADABLE = {
  not_utf8: "not a UTF-8 CSV file",
  empty: "the file is empty",
  malformed: "the file can't be read as CSV",
} as const;

function headerKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Transaction and rule pairs from a findings file or an answer key, in any column order. */
export function readPairs(bytes: Uint8Array, label: string): Pair[] {
  const result = readCsv(bytes);
  if (!result.ok) throw new Error(`${label}: ${UNREADABLE[result.reason]}`);
  const headers = result.table.header.map(headerKey);
  const transaction = headers.findIndex((header) => TRANSACTION_HEADERS.has(header));
  const rule = headers.findIndex((header) => RULE_HEADERS.has(header));
  if (transaction < 0 || rule < 0) {
    throw new Error(`${label}: needs transaction_id and rule_id columns`);
  }
  return result.table.rows
    .map((row) => ({ transactionId: row[transaction] ?? "", ruleId: row[rule] ?? "" }))
    .filter((pair) => pair.transactionId !== "" && pair.ruleId !== "");
}

function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Pairs as a findings file: a header and one row per pair. */
export function writePairs(pairs: readonly Pair[]): string {
  const lines = pairs.map((pair) => `${cell(pair.transactionId)},${cell(pair.ruleId)}`);
  return `${["transaction_id,rule_id", ...lines].join("\n")}\n`;
}
