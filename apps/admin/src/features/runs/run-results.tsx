import type { ApiClient, RunDetail, RunResult, RunResultOutcome, Severity } from "@hrcc/shared";
import { Button, Card, SelectField, Tag, type TagTone } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { runResultsQueryKey } from "./runs-query";

const OUTCOMES: readonly RunResultOutcome[] = ["flagged", "could_not_check"];
const SEVERITY_TONES: Record<Severity, TagTone> = { High: "high", Medium: "medium", Low: "low" };

function ResultItem({ item }: { item: RunResult }) {
  const { t } = useTranslation("admin");
  const { locale } = useLocaleSwitch();
  return (
    <li data-testid="run-result" className="rounded-[10px] border border-line p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {item.findingId ? (
          <span className="font-mono font-semibold">
            <bdi>{item.findingId}</bdi>
          </span>
        ) : null}
        <span className="font-mono">
          <bdi>{item.transactionId ?? t("runs.results.row", { row: item.rowNo })}</bdi>
        </span>
        <span className="font-mono text-muted">
          <bdi>{item.ruleId}</bdi>
        </span>
        {item.outcome === "flagged" ? (
          <Tag tone={SEVERITY_TONES[item.severity]}>{t(`rules.severity.${item.severity}`)}</Tag>
        ) : null}
      </div>
      {item.outcome === "flagged" ? (
        <p className="mt-1">{locale === "ar" ? item.explanationAr : item.explanationEn}</p>
      ) : (
        <p className="mt-1 text-warn">
          {item.error
            ? t("runs.results.error", { error: item.error })
            : item.missing
                .map((missing) =>
                  t("runs.results.missing", {
                    field: missing.field,
                    reason: t(`runs.results.reasons.${missing.reason}`),
                  }),
                )
                .join("; ")}
        </p>
      )}
      {item.evidence.length > 0 ? (
        <ul className="mt-1 font-mono text-xs text-muted">
          {item.evidence.map((fact) => (
            <li key={`${fact.field}:${fact.condition}`}>
              <bdi>{fact.field}</bdi> ={" "}
              <bdi>{Array.isArray(fact.value) ? fact.value.join(", ") : fact.value}</bdi>
              {fact.condition ? (
                <>
                  {" "}
                  <bdi>({fact.condition})</bdi>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** The run's findings, or the transactions it couldn't check, a page at a time. */
export function RunResults({ api, run }: { api: ApiClient; run: RunDetail }) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const [outcome, setOutcome] = useState<RunResultOutcome>("flagged");
  const [ruleId, setRuleId] = useState("");
  const results = useInfiniteQuery({
    queryKey: runResultsQueryKey(run.id, outcome, ruleId),
    queryFn: ({ pageParam }) =>
      api.listRunResults(run.id, {
        outcome,
        ruleId: ruleId || undefined,
        after: pageParam,
        limit: 50,
      }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextAfter ?? undefined,
  });
  const items = results.data?.pages.flatMap((page) => page.results) ?? [];
  return (
    <Card className="mb-4">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="flex gap-1">
          {OUTCOMES.map((value) => (
            <Button
              key={value}
              variant={outcome === value ? "primary" : "secondary"}
              aria-pressed={outcome === value}
              onClick={() => setOutcome(value)}
            >
              {t(value === "flagged" ? "runs.results.findings" : "runs.results.couldNotCheck")}
            </Button>
          ))}
        </div>
        <SelectField
          label={t("runs.results.rule")}
          value={ruleId}
          onChange={(event) => setRuleId(event.target.value)}
        >
          <option value="">{t("runs.results.allRules")}</option>
          {run.rules.map((rule) => (
            <option key={rule.ruleId} value={rule.ruleId}>
              {rule.ruleId} · {rule.title}
            </option>
          ))}
        </SelectField>
      </div>
      {results.isPending ? <p className="text-muted">{tUi("states.loading")}</p> : null}
      {results.isError ? <p className="text-high">{tUi("states.error")}</p> : null}
      {results.data && items.length === 0 ? (
        <p className="text-muted">{t("runs.results.none")}</p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <ResultItem key={item.seq} item={item} />
        ))}
      </ul>
      {results.hasNextPage ? (
        <Button
          className="mt-3"
          disabled={results.isFetchingNextPage}
          onClick={() => void results.fetchNextPage()}
        >
          {t("runs.results.more")}
        </Button>
      ) : null}
    </Card>
  );
}
