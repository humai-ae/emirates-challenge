import { explainFinding, findingIdOf } from "@hrcc/engine";
import {
  type FindingFormatValues,
  type RunDetail,
  type RunResult,
  type RunSummary,
  RunTotalsSchema,
} from "@hrcc/shared";
import type { RunEntity, RunResultEntity, RunRuleSnapshot } from "../database/entities/index.js";

export function toRunSummary(run: RunEntity): RunSummary {
  return {
    id: run.id,
    status: run.status,
    dataset: { id: run.dataset.id, name: run.dataset.name },
    startedAt: run.startedAt.toISOString(),
    startedBy: run.startedBy.displayName,
    finishedAt: run.finishedAt.toISOString(),
    // Runs from before flags have no flag counts: the schema gives them zeros.
    totals: RunTotalsSchema.parse(run.totals),
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

/** A result as the run page shows it: findings explained in both languages. */
export function toRunResult(
  row: RunResultEntity,
  rule: RunRuleSnapshot | undefined,
  values: FindingFormatValues,
): RunResult {
  const explain = (locale: "en" | "ar") =>
    row.outcome === "flagged" && rule
      ? explainFinding(rule.preset, row.evidence, rule.values, locale)
      : null;
  return {
    seq: row.seq,
    ruleId: row.ruleId,
    ruleVersion: row.ruleVersion,
    rowNo: row.rowNo,
    transactionId: row.transactionId,
    // Texts still waiting for AI aren't listed; read as could-not-check should one slip through.
    outcome: row.outcome === "needs_judgment" ? "could_not_check" : row.outcome,
    findingId: row.findingNo === null ? null : findingIdOf(row.findingNo, values),
    severity: rule?.severity ?? "Medium",
    evidence: row.evidence,
    missing: row.missing,
    error: row.error,
    explanationEn: explain("en"),
    explanationAr: explain("ar"),
  };
}
