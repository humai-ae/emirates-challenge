import type { AuditEvent, FlagDetail, FlagStatus, FlagSummary } from "@hrcc/shared";
import { toTeamSummary } from "../auth/users.service.js";
import type { FlagEntity } from "../database/entities/index.js";

/** A flag is overdue past its due date while someone still has to act on it. */
const CAN_BE_OVERDUE: readonly FlagStatus[] = ["with_analyst", "confirmed", "being_fixed"];

export function toFlagSummary(flag: FlagEntity, today: string): FlagSummary {
  return {
    id: flag.id,
    kind: flag.kind,
    status: flag.status,
    ruleId: flag.ruleId,
    ruleTitle: flag.ruleTitle,
    transactionIds: flag.transactionIds,
    explanationEn: flag.explanationEn,
    explanationAr: flag.explanationAr,
    severity: flag.severity,
    ownerTeam: flag.ownerTeam ? toTeamSummary(flag.ownerTeam) : null,
    dueDate: flag.dueDate,
    overdue: CAN_BE_OVERDUE.includes(flag.status) && flag.dueDate < today,
    assignee: flag.assignment?.assignee ?? null,
    fix: flag.fix,
    // Shown while it is being fixed again; afterwards the timeline keeps it.
    sentBack: flag.status === "being_fixed" ? flag.sentBack : null,
    seenAgain: flag.seenAgain.length,
    runId: flag.runId,
    createdAt: flag.createdAt.toISOString(),
  };
}

export type DetailExtras = Pick<
  FlagDetail,
  "ruleText" | "restatementEn" | "restatementAr" | "related" | "allowed" | "assignees" | "teams"
> & { timeline: AuditEvent[] };

export function toFlagDetail(flag: FlagEntity, today: string, extras: DetailExtras): FlagDetail {
  return {
    ...toFlagSummary(flag, today),
    ...extras,
    ruleVersion: flag.ruleVersion,
    evidence: flag.evidence,
    transaction: flag.transaction,
    people: flag.people,
    severityReasons: flag.severityReasons,
    reportTo: flag.reportTo,
    suggestedFixEn: flag.suggestedFixEn,
    suggestedFixAr: flag.suggestedFixAr,
    explanationSource: flag.explanationSource,
    decision: flag.decision,
    assignment: flag.assignment,
    verification: flag.verification,
    seenAgainRuns: flag.seenAgain,
    rowVersion: flag.rowVersion,
  };
}
