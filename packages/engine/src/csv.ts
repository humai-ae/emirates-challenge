import Papa from "papaparse";

export interface CsvTable {
  header: string[];
  /** Trimmed values, padded or cut to the header's width. */
  rows: string[][];
  delimiter: string;
  /** 1-based data row numbers whose field count differed from the header's. */
  widthMismatches: number[];
  /** Headers that were renamed because they were blank or repeated. */
  renamedHeaders: string[];
}

export type CsvReadFailure = "not_utf8" | "empty" | "malformed";

export type CsvReadResult = { ok: true; table: CsvTable } | { ok: false; reason: CsvReadFailure };

/** UTF-8 only, with or without a BOM: any other encoding is refused, never guessed. */
export function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    // The decoder drops a leading BOM.
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function readCsv(bytes: Uint8Array): CsvReadResult {
  const text = decodeUtf8(bytes);
  if (text === null) return { ok: false, reason: "not_utf8" };
  if (text.trim() === "") return { ok: false, reason: "empty" };
  if (text.includes("\u0000")) return { ok: false, reason: "malformed" };
  const parsed = Papa.parse<string[]>(text, {
    delimitersToGuess: [",", ";", "\t", "|"],
    skipEmptyLines: "greedy",
  });
  if (parsed.errors.some((error) => error.type === "Quotes")) {
    return { ok: false, reason: "malformed" };
  }
  const [rawHeader, ...body] = parsed.data;
  if (!rawHeader || rawHeader.every((cell) => cell.trim() === "")) {
    return { ok: false, reason: "empty" };
  }
  const { header, renamed } = normaliseHeader(rawHeader);
  const widthMismatches: number[] = [];
  const rows = body.map((row, index) => {
    if (row.length !== header.length) widthMismatches.push(index + 1);
    return header.map((_, column) => (row[column] ?? "").trim());
  });
  return {
    ok: true,
    table: {
      header,
      rows,
      delimiter: parsed.meta.delimiter,
      widthMismatches,
      renamedHeaders: renamed,
    },
  };
}

function normaliseHeader(raw: string[]): { header: string[]; renamed: string[] } {
  const seen = new Map<string, number>();
  const renamed: string[] = [];
  const header = raw.map((cell, index) => {
    const original = cell.trim();
    const base = original || `column_${index + 1}`;
    const count = (seen.get(base.toLowerCase()) ?? 0) + 1;
    seen.set(base.toLowerCase(), count);
    const name = count === 1 ? base : `${base}_${count}`;
    if (name !== original) renamed.push(name);
    return name;
  });
  return { header, renamed };
}
