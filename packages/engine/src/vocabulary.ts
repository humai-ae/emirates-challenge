import type { PreparedDataset } from "./dataset.js";
import { splitList } from "./values.js";

/** The values rules choose from: transaction types and document names. */
export interface Vocabulary {
  types: string[];
  documents: string[];
}

function frequent(dataset: PreparedDataset, role: string, list: boolean, limit: number): string[] {
  const column = dataset.roleColumn("transactions", role);
  if (!column) return [];
  const counts = new Map<string, number>();
  for (const row of dataset.rows) {
    const raw = row.cells[column.name] ?? "";
    const values = list
      ? splitList(raw, column.type === "list" ? column.listDelimiter : null)
      : [raw.trim()];
    for (const value of values) {
      if (value !== "") counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts]
    .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, limit)
    .map(([value]) => value);
}

/** A dataset's transaction types and document names, most frequent first. */
export function datasetVocabulary(dataset: PreparedDataset, limit = 50): Vocabulary {
  return {
    types: frequent(dataset, "type", false, limit),
    documents: frequent(dataset, "documents", true, limit),
  };
}
