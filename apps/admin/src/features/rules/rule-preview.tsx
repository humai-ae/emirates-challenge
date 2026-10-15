import type {
  ApiClient,
  Evidence,
  ParameterValue,
  PresetId,
  Preview,
  PreviewRuleResponse,
} from "@hrcc/shared";
import { apiErrorMessage, Card } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { keepPreviousData, type UseQueryResult, useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCount } from "../data/format";

/** The value once it has stopped changing for a moment, so typing doesn't send a request per key. */
function useSettled<T>(value: T, delay = 400): T {
  const key = JSON.stringify(value);
  const [settled, setSettled] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(JSON.parse(key) as T), delay);
    return () => clearTimeout(timer);
  }, [key, delay]);
  return settled;
}

/** What the check would do on the newest dataset, for values still being edited. */
export function useRulePreview(
  api: ApiClient,
  preset: PresetId | null,
  values: Readonly<Record<string, ParameterValue>>,
): UseQueryResult<PreviewRuleResponse> {
  const settled = useSettled({ preset, values });
  return useQuery({
    queryKey: ["rule-preview", settled],
    queryFn: () => api.previewRule({ preset: settled.preset as PresetId, values: settled.values }),
    enabled: settled.preset !== null,
    placeholderData: keepPreviousData,
  });
}

function EvidenceList({ items }: { items: readonly Evidence[] }) {
  return (
    <ul className="font-mono text-xs">
      {items.map((item) => (
        <li key={`${item.field}:${item.condition}`}>
          <bdi>{item.field}</bdi> ={" "}
          <bdi>{Array.isArray(item.value) ? item.value.join(", ") : item.value}</bdi>{" "}
          <span className="text-muted">
            <bdi>{item.condition}</bdi>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Examples({ preview }: { preview: Preview }) {
  const { t } = useTranslation("admin");
  const name = (row: { rowNo: number; transactionId: string | null }) =>
    row.transactionId ?? t("rules.preview.row", { row: row.rowNo });
  return (
    <div className="mt-3 grid gap-4 md:grid-cols-2">
      <section>
        <h3 className="mb-2 font-semibold">{t("rules.preview.flagged")}</h3>
        <ul className="flex flex-col gap-2">
          {preview.flagged.map((row) => (
            <li key={row.rowNo} className="rounded-[10px] border border-line p-2 text-sm">
              <div className="font-mono font-semibold">
                <bdi>{name(row)}</bdi>
              </div>
              <EvidenceList items={row.evidence} />
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-2 font-semibold">{t("rules.preview.nearMisses")}</h3>
        <ul className="flex flex-col gap-2">
          {preview.nearMisses.map((row) => (
            <li key={row.rowNo} className="rounded-[10px] border border-line p-2 text-sm">
              <div className="font-mono font-semibold">
                <bdi>{name(row)}</bdi>
              </div>
              <div>
                {t(`rules.preview.nearReasons.${row.reason}`, { defaultValue: row.reason })}
              </div>
              <EvidenceList items={row.facts} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function RulePreview({
  query,
  preset,
}: {
  query: UseQueryResult<PreviewRuleResponse>;
  preset: PresetId | null;
}) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const [examples, setExamples] = useState(false);
  const count = (value: number) => formatCount(value, locale);
  const needed = (roles: readonly { role: string }[]) =>
    roles.map((need) => t(`dataset.roles.${need.role}`, { defaultValue: need.role })).join(", ");

  let body: ReactNode;
  if (!preset) {
    body = <p className="text-muted">{t("rules.preview.choose")}</p>;
  } else if (query.isError) {
    body = <p className="text-high">{apiErrorMessage(query.error, tUi)}</p>;
  } else if (!query.data) {
    body = <p className="text-muted">{t("rules.preview.loading")}</p>;
  } else if (query.data.result.status === "invalid_parameters") {
    body = <p className="text-warn">{t("rules.preview.invalid")}</p>;
  } else if (query.data.result.status === "needs_data") {
    body = (
      <p className="text-high">
        {t("rules.preview.needsData", { fields: needed(query.data.result.needs) })}
      </p>
    );
  } else {
    const { preview, check } = query.data.result;
    body = (
      <div className="flex flex-col gap-2">
        <p>{locale === "ar" ? query.data.result.restatementAr : query.data.result.restatementEn}</p>
        <p className="font-semibold">
          {check.checkKind === "judgment"
            ? t("rules.preview.judgment", {
                toAi: count(preview.counts.needs_judgment),
                flagged: count(preview.counts.flagged),
              })
            : t("rules.preview.summary", {
                flagged: count(preview.counts.flagged),
                applicable: count(preview.applicable),
              })}
        </p>
        {preview.missing.map((missing) => (
          <p key={`${missing.field}:${missing.reason}`} className="text-sm text-warn">
            {t("rules.preview.couldNotCheck", {
              total: count(missing.count),
              field: missing.field,
              reason: t(`rules.preview.reasons.${missing.reason}`),
            })}
          </p>
        ))}
        {preview.errors.map((failure) => (
          <p key={failure.message} className="text-sm text-high">
            {t("rules.preview.failed", { total: count(failure.count), message: failure.message })}
          </p>
        ))}
        {preview.warnings.map((warning) => (
          <p key={warning} className="text-sm text-warn">
            {t(`rules.preview.warnings.${warning}`)}
          </p>
        ))}
        {preview.flagged.length + preview.nearMisses.length > 0 ? (
          <div>
            <button
              type="button"
              aria-expanded={examples}
              className="text-sm font-semibold text-primary hover:underline"
              onClick={() => setExamples((open) => !open)}
            >
              {t(examples ? "rules.preview.hideExamples" : "rules.preview.showExamples")}
            </button>
            {examples ? <Examples preview={preview} /> : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Card data-testid="rule-preview" aria-live="polite">
      <h2 className="mb-1 text-lg font-bold">{t("rules.preview.title")}</h2>
      {query.data ? (
        <p className="mb-3 text-sm text-muted">
          <bdi>{query.data.dataset.name}</bdi> ·{" "}
          {t("rules.preview.transactions", { total: count(query.data.dataset.transactionCount) })}
        </p>
      ) : null}
      {body}
    </Card>
  );
}
