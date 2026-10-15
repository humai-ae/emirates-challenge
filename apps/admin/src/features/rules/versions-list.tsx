import type { Rule } from "@hrcc/shared";
import { Card } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { useTranslation } from "react-i18next";
import { formatMoment } from "../data/format";
import { RuleStatusTag } from "./rule-status-tags";

export function VersionsList({ rule }: { rule: Rule }) {
  const { t } = useTranslation("admin");
  const { locale } = useLocaleSwitch();
  const when = (iso: string) => formatMoment(iso, locale);
  return (
    <Card>
      <h2 className="mb-3 text-lg font-bold">{t("rules.versions.title")}</h2>
      <ol>
        {rule.versions.map((version) => (
          <li
            key={version.version}
            data-testid="rule-version"
            className="flex flex-col gap-1 border-b border-line py-3 last:border-b-0"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">
                {t("rules.versions.version", { version: version.version })}
              </span>
              <RuleStatusTag status={version.status} />
              {version.preset ? (
                <span className="text-sm text-muted">{t(`rules.presets.${version.preset}`)}</span>
              ) : null}
            </div>
            <p className="text-sm text-muted">
              {t(`rules.versions.drafted.${version.draftedBy}`, {
                date: when(version.createdAt),
                name: version.createdBy,
              })}
            </p>
            {version.approvedAt && version.approvedBy ? (
              <p className="text-sm text-muted">
                {t("rules.versions.approved", {
                  date: when(version.approvedAt),
                  name: version.approvedBy,
                })}
              </p>
            ) : null}
            {version.closedAt && version.closedBy ? (
              <p className="text-sm text-muted">
                {t(
                  version.status === "retired"
                    ? "rules.versions.retired"
                    : "rules.versions.rejected",
                  {
                    date: when(version.closedAt),
                    name: version.closedBy,
                  },
                )}
              </p>
            ) : null}
            {version.reason ? (
              <p className="text-sm">{t("rules.versions.reason", { reason: version.reason })}</p>
            ) : null}
            {version.closedFor ? (
              <p className="text-sm">{t(`rules.versions.closedFor.${version.closedFor}`)}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}
