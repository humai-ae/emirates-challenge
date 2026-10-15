import type { ColumnType } from "@hrcc/shared";
import type { CsvTable } from "./csv.js";
import { type DateFormat, detectDateFormat, parseDateValue } from "./dates.js";

export interface ColumnProfile {
  name: string;
  position: number;
  type: ColumnType;
  blankCount: number;
  distinctCount: number;
  /** Non-blank values that don't parse as the column's type (numbers and dates only). */
  invalidCount: number;
  /** The first five values that didn't parse. */
  invalidExamples: string[];
  /** Up to five distinct non-blank values, in file order. */
  samples: string[];
  /** Numbers for numeric columns; `YYYY-MM-DD` or UTC ISO strings for date columns. */
  min: number | string | null;
  max: number | string | null;
  dateFormat: DateFormat | null;
  dateAmbiguous: boolean;
  listDelimiter: ";" | "|" | null;
}

const BOOLEAN_VALUES = new Set(["true", "false", "yes", "no"]);
const CODE_LIKE = /^[A-Za-z]{1,6}[-_]?\d{2,}$/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
const GROUPED_NUMBER = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/;

/** A number written plainly or with thousands separators; null for anything else. */
export function parseNumber(value: string): number | null {
  const text = value.trim();
  if (PLAIN_NUMBER.test(text)) return Number(text);
  if (GROUPED_NUMBER.test(text)) return Number(text.replaceAll(",", ""));
  return null;
}

/** "Approver2ID" → ["approver", "2", "id"]; "Amount (AED)" → ["amount", "aed"]. */
export function nameTokens(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function looksLikeId(name: string, filled: readonly string[], distinctCount: number): boolean {
  const tokens = nameTokens(name);
  if (tokens.includes("id") || tokens.includes("ids")) {
    return filled.every((value) => !/[\s;|]/.test(value));
  }
  const codeLike = filled.filter((value) => CODE_LIKE.test(value)).length;
  return distinctCount >= filled.length * 0.5 && codeLike >= filled.length * 0.9;
}

function listDelimiter(filled: readonly string[]): ";" | "|" | null {
  for (const delimiter of [";", "|"] as const) {
    const containing = filled.filter((value) => value.includes(delimiter)).length;
    const shortParts = filled.every((value) =>
      value.split(delimiter).every((part) => part.trim().length <= 60),
    );
    if (containing > 0 && containing >= filled.length * 0.1 && shortParts) return delimiter;
  }
  return null;
}

function extremes(numbers: readonly number[]): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of numbers) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}

export function profileColumn(
  name: string,
  position: number,
  rawValues: readonly string[],
): ColumnProfile {
  const values = rawValues.map((value) => value.trim());
  const filled = values.filter((value) => value !== "");
  const distinct = [...new Set(filled)];
  const base = {
    name,
    position,
    blankCount: values.length - filled.length,
    distinctCount: distinct.length,
    invalidCount: 0,
    invalidExamples: [] as string[],
    samples: distinct.slice(0, 5),
    min: null,
    max: null,
    dateFormat: null,
    dateAmbiguous: false,
    listDelimiter: null,
  };
  if (filled.length === 0) return { ...base, type: "text" };
  if (filled.every((value) => BOOLEAN_VALUES.has(value.toLowerCase()))) {
    return { ...base, type: "boolean" };
  }
  if (looksLikeId(name, filled, distinct.length)) return { ...base, type: "id" };

  const numbers = filled.map(parseNumber);
  const numeric = numbers.filter((value): value is number => value !== null);
  if (numeric.length >= filled.length * 0.9) {
    const invalid = filled.filter((_, index) => numbers[index] === null);
    return {
      ...base,
      type: numeric.every(Number.isInteger) ? "integer" : "number",
      ...extremes(numeric),
      invalidCount: invalid.length,
      invalidExamples: invalid.slice(0, 5),
    };
  }

  const date = detectDateFormat(filled);
  if (date) {
    const parsed = filled.map((value) => parseDateValue(value, date.format));
    const valid = parsed.filter((value): value is string => value !== null).sort();
    const invalid = filled.filter((_, index) => parsed[index] === null);
    return {
      ...base,
      type: date.kind,
      min: valid[0] ?? null,
      max: valid.at(-1) ?? null,
      dateFormat: date.format,
      dateAmbiguous: date.ambiguous,
      invalidCount: invalid.length,
      invalidExamples: invalid.slice(0, 5),
    };
  }

  const delimiter = listDelimiter(filled);
  if (delimiter) return { ...base, type: "list", listDelimiter: delimiter };
  if (distinct.length <= 50 && distinct.length <= filled.length * 0.5) {
    return { ...base, type: "category" };
  }
  return { ...base, type: "text" };
}

export function profileTable(table: CsvTable): ColumnProfile[] {
  return table.header.map((name, position) =>
    profileColumn(
      name,
      position,
      table.rows.map((row) => row[position] ?? ""),
    ),
  );
}
