import { type ApiClient, PRESET_CATALOGUE, type RuleVersion } from "@hrcc/shared";
import { Card } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { useTranslation } from "react-i18next";
import { formatValue, valuesOf } from "./rule-format";
import { RulePreview, useRulePreview } from "./rule-preview";

/** A version shown read-only (the live one, or the newest when nothing is live or open). */
export function VersionSummary({
  api,
  version,
  title,
}: {
  api: ApiClient;
  version: RuleVersion;
  title: string;
}) {
  const { t } = useTranslation("admin");
  const { locale } = useLocaleSwitch();
  const values = valuesOf(version);
  const preview = useRulePreview(api, version.preset, values);
  const team = version.ownerTeam;
  const rows: Array<[string, string]> = [
    [t("rules.form.checkType"), version.preset ? t(`rules.presets.${version.preset}`) : "—"],
    ...(version.preset
      ? PRESET_CATALOGUE[version.preset].parameters.map((spec): [string, string] => [
          t(`rules.parameters.${spec.name}`),
          formatValue(spec, values[spec.name] ?? null, locale, t),
        ])
      : []),
    [t("rules.form.severity"), t(`rules.severity.${version.severity}`)],
    [
      t("rules.form.owner"),
      team
        ? locale === "ar"
          ? (team.nameAr ?? team.nameEn)
          : team.nameEn
        : t("rules.form.ownerByType"),
    ],
    [
      t("rules.page.suggested"),
      locale === "ar" ? version.suggestedActionAr : version.suggestedActionEn,
    ],
  ];
  return (
    <>
      <Card>
        <h2 className="mb-3 text-lg font-bold">{title}</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-sm text-muted">{label}</dt>
              <dd>
                <bdi>{value}</bdi>
              </dd>
            </div>
          ))}
        </dl>
      </Card>
      <RulePreview query={preview} preset={version.preset} />
    </>
  );
}
