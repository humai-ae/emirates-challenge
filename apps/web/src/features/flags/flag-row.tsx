import type { FlagSummary } from "@hrcc/shared";
import { Card, Tag } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { useTranslation } from "react-i18next";
import { teamNameFor } from "../../lib/team-name";
import { FlagLink, type FlagRole } from "./flag-sections";
import { explanationOf, formatDay, needsHumanReview, SEVERITY_TONES, STATUS_TONES } from "./format";

/** One flag in a list: severity, kind, the rule, why, the transaction, its team and due date. */
export function FlagRow({
  flag,
  reader,
  showStatus = false,
  showFix = false,
}: {
  flag: FlagSummary;
  reader: FlagRole;
  showStatus?: boolean;
  showFix?: boolean;
}) {
  const { t } = useTranslation("web");
  const { locale } = useLocaleSwitch();
  const team = teamNameFor(flag.ownerTeam, locale);
  return (
    <li data-testid="flag-row">
      <Card className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone={SEVERITY_TONES[flag.severity]}>{t(`flags.severity.${flag.severity}`)}</Tag>
          <Tag tone={flag.kind === "rule_break" ? "neutral" : "ai"}>
            {needsHumanReview(flag)
              ? t("flags.needsReview")
              : flag.confidence
                ? t("flags.kindConfidence", {
                    kind: t(`flags.kind.${flag.kind}`),
                    confidence: t(`flags.confidence.${flag.confidence}`),
                  })
                : t(`flags.kind.${flag.kind}`)}
          </Tag>
          {showStatus ? (
            <Tag tone={STATUS_TONES[flag.status]}>{t(`flags.status.${flag.status}`)}</Tag>
          ) : null}
          {flag.textSources[locale] === "ai" ? <Tag tone="ai">{t("flags.aiWording")}</Tag> : null}
          {flag.overdue ? <Tag tone="high">{t("flags.overdue")}</Tag> : null}
          {flag.seenAgain > 0 ? (
            <Tag tone="info">{t("flags.seenAgain", { count: flag.seenAgain })}</Tag>
          ) : null}
          <span className="ms-auto font-mono text-sm text-muted">
            <bdi>{flag.id}</bdi>
          </span>
        </div>
        <FlagLink
          id={flag.id}
          reader={reader}
          className="font-semibold text-primary hover:underline"
        >
          <bdi>{flag.ruleId}</bdi> · <bdi>{flag.ruleTitle}</bdi>
        </FlagLink>
        <p dir="auto">{explanationOf(flag, locale)}</p>
        <p className="text-sm text-muted">
          {t("flags.transaction")}{" "}
          <bdi className="font-mono">{flag.transactionIds.join(", ") || "—"}</bdi>
          {" · "}
          {team ? <bdi>{team}</bdi> : t("flags.noTeam")}
          {" · "}
          {t("flags.fixBy")} {formatDay(flag.dueDate, locale)}
          {flag.assignee ? (
            <>
              {" · "}
              {t("flags.assignee")} <bdi>{flag.assignee}</bdi>
            </>
          ) : null}
        </p>
        {showFix && flag.fix ? (
          <p className="text-sm" dir="auto">
            {t("flags.fixed", { by: flag.fix.by, type: t(`flags.fixType.${flag.fix.type}`) })} ·{" "}
            {flag.fix.note}
          </p>
        ) : null}
        {flag.sentBack ? (
          <p className="text-sm text-high" dir="auto">
            {t("flags.sentBack", { by: flag.sentBack.by, reason: flag.sentBack.reason })}
          </p>
        ) : null}
      </Card>
    </li>
  );
}
