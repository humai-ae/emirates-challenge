import type { ApiClient } from "@hrcc/shared";
import { apiErrorMessage, Button, Card, EmptyState, PageHeader } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { formatMoment, formatNumber } from "../flags/format";
import { refreshAfterFlagChange } from "../flags/queries";

const RUNS_QUERY_KEY = ["runs"] as const;

/** The latest check of every transaction against every live rule, and where an analyst starts one. */
export function ReportPage({ api }: { api: ApiClient }) {
  const { t } = useTranslation("web");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const queryClient = useQueryClient();
  const runs = useQuery({
    queryKey: RUNS_QUERY_KEY,
    queryFn: () => api.listRuns(),
    // While AI reads texts, the report follows it.
    refetchInterval: (current) =>
      (current.state.data?.runs[0]?.totals.waitingForAi ?? 0) > 0 ? 3_000 : false,
  });
  const start = useMutation({
    mutationFn: () => api.startRun(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RUNS_QUERY_KEY });
      void refreshAfterFlagChange(queryClient);
    },
  });
  const latest = runs.data?.runs[0];
  const retry = useMutation({
    mutationFn: (id: string) => api.retryAiChecks(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RUNS_QUERY_KEY });
      void refreshAfterFlagChange(queryClient);
    },
  });
  const totals = latest
    ? ([
        ["transactions", latest.totals.transactions],
        ["findings", latest.totals.findings],
        ["newFlags", latest.totals.newFlags],
        ["seenAgain", latest.totals.seenAgain],
        ["couldNotCheck", latest.totals.couldNotCheck],
        ["waitingForAi", latest.totals.waitingForAi],
      ] as const)
    : [];
  return (
    <>
      <PageHeader
        title={t("report.title")}
        subtitle={t("report.subtitle")}
        actions={
          <Button variant="primary" disabled={start.isPending} onClick={() => start.mutate()}>
            {t("report.run")}
          </Button>
        }
      />
      {start.isError ? (
        <p role="alert" className="mb-3 text-high">
          {apiErrorMessage(start.error, tUi)}
        </p>
      ) : null}
      {runs.isPending ? <p className="text-muted">{tUi("states.loading")}</p> : null}
      {runs.isError ? (
        <p role="alert" className="text-high">
          {tUi("states.error")}
        </p>
      ) : null}
      {runs.data && !latest ? (
        <EmptyState title={t("report.emptyTitle")}>{t("report.emptyBody")}</EmptyState>
      ) : null}
      {latest ? (
        <Card data-testid="latest-run">
          <h2 className="mb-1 text-lg font-bold">{t("report.latest", { id: latest.id })}</h2>
          <p className="mb-3 text-sm text-muted">
            {t("report.ran", {
              time: formatMoment(latest.finishedAt, locale),
              by: latest.startedBy,
              dataset: latest.dataset.name,
            })}
          </p>
          {latest.totals.waitingForAi > 0 ? (
            <p role="status" className="mb-3 rounded-[10px] bg-ai-bg px-3.5 py-2.5 text-sm text-ai">
              {t("report.ai.waiting", { count: formatNumber(latest.totals.waitingForAi, locale) })}
            </p>
          ) : null}
          {latest.totals.aiFailed > 0 ? (
            <div
              role="alert"
              className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-warn-bg px-3.5 py-2.5 text-sm text-warn"
            >
              <span>
                {t("report.ai.failed", { count: formatNumber(latest.totals.aiFailed, locale) })}
              </span>
              <Button disabled={retry.isPending} onClick={() => retry.mutate(latest.id)}>
                {t("report.ai.retry")}
              </Button>
              {retry.isError ? (
                <span className="w-full">{apiErrorMessage(retry.error, tUi)}</span>
              ) : null}
            </div>
          ) : null}
          <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {totals.map(([key, value]) => (
              <div key={key} data-testid="report-total" className="rounded-[10px] bg-soft p-3">
                <dt className="text-sm text-muted">{t(`report.totals.${key}`)}</dt>
                <dd className="text-xl font-bold">{formatNumber(value, locale)}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4">
            <Link to="/analyst/inbox" className="font-semibold text-primary underline">
              {t("report.toInbox")}
            </Link>
          </div>
        </Card>
      ) : null}
    </>
  );
}
