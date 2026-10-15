import type { Rule, RuleStatus } from "@hrcc/shared";
import { Tag, type TagTone } from "@hrcc/ui";
import { useTranslation } from "react-i18next";
import { shownVersions } from "./rule-status";

const TONES: Record<RuleStatus, TagTone> = {
  active: "ok",
  draft: "warn",
  needs_data: "high",
  draft_failed: "high",
  rejected: "neutral",
  retired: "neutral",
};

export function RuleStatusTag({ status }: { status: RuleStatus }) {
  const { t } = useTranslation("admin");
  return <Tag tone={TONES[status]}>{t(`rules.status.${status}`)}</Tag>;
}

export function RuleStatusTags({ rule }: { rule: Rule }) {
  return (
    <div className="flex flex-wrap gap-1">
      {shownVersions(rule).map((version) => (
        <RuleStatusTag key={version.version} status={version.status} />
      ))}
    </div>
  );
}
