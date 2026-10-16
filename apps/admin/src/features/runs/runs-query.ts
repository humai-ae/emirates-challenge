import type { RunResultOutcome } from "@hrcc/shared";

export const RUNS_QUERY_KEY = ["runs"] as const;

export function runQueryKey(id: string) {
  return [...RUNS_QUERY_KEY, id] as const;
}

export function runResultsQueryKey(id: string, outcome: RunResultOutcome, ruleId: string) {
  return [...RUNS_QUERY_KEY, id, "results", outcome, ruleId] as const;
}

export const FINDING_FORMAT_QUERY_KEY = ["finding-format"] as const;
