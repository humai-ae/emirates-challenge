import type { OpinionCode } from "@hrcc/shared";
import type { PreparedDataset } from "./dataset.js";
import type { PreparedCheck } from "./evaluate.js";
import { DateValue, readCell } from "./values.js";

/** A field of a transaction as Jev reads it for a second opinion. */
export interface OpinionField {
  name: string;
  value: string | string[];
}

/** What Jev may see of one transaction: the fields its rules name, and day gaps between dates. */
export interface OpinionInput {
  fields: OpinionField[];
  gaps: Array<{ name: string; days: number }>;
}

const MAX_FIELDS = 40;
const MAX_TEXT = 300;
const MAX_ITEMS = 20;
const MAX_ITEM = 100;
/** Jev disagrees with a flag below this chance of a break, and with a pass above this one. */
const FLAGGED_BELOW = 0.2;
const PASSED_ABOVE = 0.85;
/** Below this, Jev didn't have enough to judge, so it doesn't disagree. */
const MIN_ENOUGH = 0.5;

const round = (value: number) => Math.round(value * 10_000) / 10_000;

function dateOf(dataset: PreparedDataset, index: number, role: string): DateValue | null {
  const column = dataset.roleColumn("transactions", role);
  if (!column) return null;
  const read = readCell(dataset.rows[index]?.cells[column.name], column);
  return read.ok && read.value instanceof DateValue ? read.value : null;
}

/** The transaction's last approval, by day then minute; null without a dated approval. */
function lastApproval(dataset: PreparedDataset, index: number): DateValue | null {
  let last: DateValue | null = null;
  for (const { item } of dataset.approvalTimes(index)) {
    if (item.kind !== "value" || !(item.value instanceof DateValue)) continue;
    const value = item.value;
    if (
      last === null ||
      value.day > last.day ||
      (value.day === last.day && (value.minute ?? 0) > (last.minute ?? 0))
    ) {
      last = value;
    }
  }
  return last;
}

/**
 * What Jev reads of one transaction for a second opinion: each applicable rule's evidence fields,
 * once each and in rule order, and the day gaps between its dates. People appear by their IDs;
 * the caller swaps them for tokens.
 */
export function secondOpinionInput(
  dataset: PreparedDataset,
  checks: readonly PreparedCheck[],
  row: number,
): OpinionInput {
  const fields: OpinionField[] = [];
  const named = new Set<string>();
  for (const { preset, params } of checks) {
    for (const item of preset.evidence({ dataset, rowIndex: row, params })) {
      if (named.has(item.field) || fields.length >= MAX_FIELDS) continue;
      named.add(item.field);
      fields.push({
        name: item.field.slice(0, 128),
        value: Array.isArray(item.value)
          ? item.value.slice(0, MAX_ITEMS).map((value) => value.slice(0, MAX_ITEM))
          : item.value.slice(0, MAX_TEXT),
      });
    }
  }
  const effective = dateOf(dataset, row, "effective_date");
  const submitted = dateOf(dataset, row, "submitted_at");
  const approved = lastApproval(dataset, row);
  const gaps: OpinionInput["gaps"] = [];
  if (effective && submitted) {
    gaps.push({ name: "submitted_after_effective", days: submitted.day - effective.day });
  }
  if (effective && approved) {
    gaps.push({ name: "approved_after_effective", days: approved.day - effective.day });
  }
  if (submitted && approved) {
    gaps.push({ name: "approved_after_submitted", days: approved.day - submitted.day });
  }
  return { fields, gaps };
}

/**
 * Whether Jev strongly disagrees with the check: sure a flagged transaction breaks no rule, or sure
 * a passed one breaks it, and only with enough information to judge. The strength is how sure.
 */
export function disagreement(
  code: OpinionCode,
  pBreak: number,
  enough: number,
): { strength: number } | null {
  if (enough < MIN_ENOUGH) return null;
  if (code === "flagged" && pBreak < FLAGGED_BELOW) return { strength: round(1 - pBreak) };
  if (code === "passed" && pBreak > PASSED_ABOVE) return { strength: round(pBreak) };
  return null;
}
