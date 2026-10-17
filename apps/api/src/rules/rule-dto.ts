import {
  type Check,
  OPEN_RULE_STATUSES,
  type Rule,
  type RuleRequest,
  type RuleVersion,
} from "@hrcc/shared";
import { toTeamSummary } from "../auth/users.service.js";
import type { RuleEntity, RuleVersionEntity } from "../database/entities/index.js";

export function toRuleVersion(version: RuleVersionEntity): RuleVersion {
  return {
    version: version.version,
    status: version.status,
    sourceText: version.sourceText,
    preset: version.preset,
    parameters: version.parameters,
    // Stored from a valid check; the entity leaves its expressions untyped for TypeORM.
    check: version.check as Check | null,
    needs: version.needs,
    restatementEn: version.restatementEn,
    restatementAr: version.restatementAr,
    severity: version.severity,
    ownerTeam: version.ownerTeam ? toTeamSummary(version.ownerTeam) : null,
    suggestedActionEn: version.suggestedActionEn,
    suggestedActionAr: version.suggestedActionAr,
    draftedBy: version.draftedBy,
    draftError: version.draftError,
    draftMeta: version.draftMeta,
    createdAt: version.createdAt.toISOString(),
    createdBy: version.createdBy.displayName,
    approvedAt: version.approvedAt?.toISOString() ?? null,
    approvedBy: version.approvedBy?.displayName ?? null,
    closedAt: version.closedAt?.toISOString() ?? null,
    closedBy: version.closedBy?.displayName ?? null,
    reason: version.reason,
    closedFor: version.closedFor,
    criteria: version.judgmentCriteria,
  };
}

/** A rule with its versions, newest first. */
export function toRule(rule: RuleEntity, versions: readonly RuleVersionEntity[]): Rule {
  return {
    id: rule.id,
    title: rule.title,
    requestedBy: rule.requestedBy?.displayName ?? null,
    rowVersion: rule.rowVersion,
    createdAt: rule.createdAt.toISOString(),
    versions: [...versions].sort((a, b) => b.version - a.version).map(toRuleVersion),
  };
}

/** What became of a requested rule: live if any version is, else as its newest version says. */
export function toRuleRequest(
  rule: RuleEntity,
  versions: readonly RuleVersionEntity[],
): RuleRequest {
  const sorted = [...versions].sort((a, b) => b.version - a.version);
  const newest = sorted[0];
  const outcome: RuleRequest["outcome"] = sorted.some((version) => version.status === "active")
    ? "live"
    : !newest || newest.status === "drafting"
      ? "drafting"
      : OPEN_RULE_STATUSES.includes(newest.status)
        ? "waiting"
        : newest.status === "retired"
          ? "retired"
          : "rejected";
  return {
    ruleId: rule.id,
    title: rule.title,
    text: sorted.at(-1)?.sourceText ?? "",
    requestedBy: rule.requestedBy?.displayName ?? "",
    requestedAt: rule.createdAt.toISOString(),
    outcome,
    reason: outcome === "rejected" || outcome === "retired" ? (newest?.reason ?? null) : null,
  };
}
