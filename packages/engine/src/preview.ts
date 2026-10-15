import type { CheckOutcome, Evidence, MissingReason } from "@hrcc/shared";
import type { PreparedDataset } from "./dataset.js";
import { evaluateRow, type PreparedCheck, prepareCheck } from "./evaluate.js";
import type { NearMiss } from "./presets/types.js";

export interface PreviewRow {
  rowNo: number;
  transactionId: string | null;
  evidence: Evidence[];
}

export interface PreviewNearMiss {
  rowNo: number;
  transactionId: string | null;
  reason: string;
  facts: Evidence[];
}

export type PreviewWarning = "applies_to_none" | "flags_none" | "flags_many";

export interface PreviewResult {
  counts: Record<CheckOutcome, number>;
  total: number;
  /** Transactions the rule is about: every outcome except not applicable. */
  applicable: number;
  /** Up to five flagged transactions, in file order. */
  flagged: PreviewRow[];
  /** Up to three passed transactions that only just passed, in file order. */
  nearMisses: PreviewNearMiss[];
  /** How many transactions could not be checked for each missing field, most first. */
  missing: Array<{ field: string; reason: MissingReason; count: number }>;
  errors: Array<{ message: string; count: number }>;
  warnings: PreviewWarning[];
}

const FLAGGED_ROWS = 5;
const NEAR_MISSES = 3;
/** Flagging more than this share of applicable transactions is unusually high. */
const MANY = 0.2;

function nearMissOf(dataset: PreparedDataset, prepared: PreparedCheck, rowIndex: number) {
  try {
    return prepared.preset.nearMiss?.({ dataset, rowIndex, params: prepared.params }) ?? null;
  } catch {
    // A near miss is only a hint; a row it can't describe simply isn't one.
    return null;
  }
}

/** What a check would do on a dataset, before anyone approves it. Nothing is stored. */
export function previewCheck(dataset: PreparedDataset, check: unknown): PreviewResult {
  const prepared = prepareCheck(check, dataset);
  const counts: Record<CheckOutcome, number> = {
    not_applicable: 0,
    passed: 0,
    flagged: 0,
    could_not_check: 0,
    needs_judgment: 0,
  };
  const flagged: PreviewRow[] = [];
  const nearMisses: PreviewNearMiss[] = [];
  const missing = new Map<string, { field: string; reason: MissingReason; count: number }>();
  const errors = new Map<string, number>();
  for (const row of dataset.rows) {
    const result = evaluateRow(dataset, prepared, row.index);
    counts[result.outcome] += 1;
    const where = { rowNo: row.rowNo, transactionId: row.transactionId };
    if (result.outcome === "flagged" && flagged.length < FLAGGED_ROWS) {
      flagged.push({ ...where, evidence: result.evidence });
    }
    if (result.outcome === "passed" && nearMisses.length < NEAR_MISSES) {
      const near: NearMiss | null = nearMissOf(dataset, prepared, row.index);
      if (near) nearMisses.push({ ...where, ...near });
    }
    if (result.error !== null) errors.set(result.error, (errors.get(result.error) ?? 0) + 1);
    // Each field counts once per transaction.
    const fields = new Set<string>();
    for (const item of result.missing) {
      const key = `${item.field}|${item.reason}`;
      if (fields.has(key)) continue;
      fields.add(key);
      const entry = missing.get(key) ?? { field: item.field, reason: item.reason, count: 0 };
      entry.count += 1;
      missing.set(key, entry);
    }
  }
  const total = dataset.rows.length;
  const applicable = total - counts.not_applicable;
  const warnings: PreviewWarning[] = [];
  if (applicable === 0) warnings.push("applies_to_none");
  else if (prepared.check.checkKind === "structured") {
    if (counts.flagged === 0) warnings.push("flags_none");
    else if (counts.flagged > applicable * MANY) warnings.push("flags_many");
  }
  return {
    counts,
    total,
    applicable,
    flagged,
    nearMisses,
    missing: [...missing.values()].sort(
      (a, b) => b.count - a.count || (a.field < b.field ? -1 : a.field > b.field ? 1 : 0),
    ),
    errors: [...errors]
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count),
    warnings,
  };
}
