import type { RunDetail, RunSummary } from "@hrcc/shared";
import type { RunEntity } from "../database/entities/index.js";

export function toRunSummary(run: RunEntity): RunSummary {
  return {
    id: run.id,
    status: run.status,
    dataset: { id: run.dataset.id, name: run.dataset.name },
    startedAt: run.startedAt.toISOString(),
    startedBy: run.startedBy.displayName,
    finishedAt: run.finishedAt.toISOString(),
    totals: run.totals,
  };
}

export function toRunDetail(run: RunEntity): RunDetail {
  return {
    ...toRunSummary(run),
    rules: run.rules.map(
      ({ ruleId, version, title, preset, severity, ownerTeam, counts, error }) => ({
        ruleId,
        version,
        title,
        preset,
        severity,
        ownerTeam,
        counts,
        error,
      }),
    ),
  };
}
