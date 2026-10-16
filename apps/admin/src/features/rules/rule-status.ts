import { OPEN_RULE_STATUSES, type Rule, type RuleVersion } from "@hrcc/shared";

export function liveVersion(rule: Rule): RuleVersion | undefined {
  return rule.versions.find((version) => version.status === "active");
}

export function openVersion(rule: Rule): RuleVersion | undefined {
  return rule.versions.find((version) => OPEN_RULE_STATUSES.includes(version.status));
}

/** What a rule's status shows: its live and open versions, or else its newest one. */
export function shownVersions(rule: Rule): RuleVersion[] {
  const shown = [liveVersion(rule), openVersion(rule)].filter(
    (version): version is RuleVersion => version !== undefined,
  );
  return shown.length > 0 ? shown : rule.versions.slice(0, 1);
}
