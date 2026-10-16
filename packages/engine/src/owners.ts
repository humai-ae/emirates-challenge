import type { OwnerEntry } from "@hrcc/shared";

const MAX_TEAM = 80;

/** "ALLOWANCE_CHANGE", "allowance change" and "Allowance-Change" read the same. */
const key = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** A Markdown table row's cells, without code or bold marks. */
function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) =>
      cell
        .trim()
        .replace(/^`(.*)`$/, "$1")
        .replace(/^\*\*(.*)\*\*$/, "$1")
        .trim(),
    );
}

/**
 * Owner teams a policy names per transaction type: any Markdown table with a type column and a
 * team or owner column. Only types the data has are kept, under the data's own spelling; the
 * first team named for a type wins.
 */
export function findOwnerTable(text: string, types: readonly string[]): OwnerEntry[] {
  const known = new Map(types.map((type) => [key(type), type]));
  const lines = text.split(/\r?\n/);
  const found = new Map<string, string>();
  for (let at = 0; at + 2 < lines.length; at += 1) {
    const header = (lines[at] ?? "").trim();
    if (!header.startsWith("|") || !/^\|?\s*:?-{3,}/.test((lines[at + 1] ?? "").trim())) continue;
    const heads = cells(header).map((cell) => cell.toLowerCase());
    const typeAt = heads.findIndex((head) => /\btype\b/.test(head));
    const teamAt = heads.findIndex(
      (head, index) => index !== typeAt && /\b(team|owner)\b/.test(head),
    );
    if (typeAt < 0 || teamAt < 0) continue;
    for (let row = at + 2; (lines[row] ?? "").trim().startsWith("|"); row += 1) {
      const values = cells(lines[row] ?? "");
      const type = known.get(key(values[typeAt] ?? ""));
      const team = values[teamAt] ?? "";
      if (type && team && team.length <= MAX_TEAM && !found.has(type)) found.set(type, team);
    }
  }
  return [...found].map(([type, team]) => ({ type, team }));
}
