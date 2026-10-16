import type { ApiClient, RunDetail } from "@hrcc/shared";
import { apiErrorMessage, Button, Card, EmptyState, PageHeader } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { formatCount, formatMoment } from "../data/format";
import { liveVersion } from "../rules/rule-status";
import { RULES_QUERY_KEY } from "../rules/rules-query";
import { RunStatusTag } from "./run-status-tag";
import { RUNS_QUERY_KEY, runQueryKey } from "./runs-query";

const COLUMNS = ["id", "dataset", "started", "findings", "couldNotCheck", "status"] as const;
const CELL = "border-b border-line px-2.5 py-2";

export function RunsPage({
  api,
  onStarted,
}: {
  api: ApiClient;
  onStarted: (run: RunDetail) => void;
}) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const queryClient = useQueryClient();
  const runs = useQuery({ queryKey: RUNS_QUERY_KEY, queryFn: () => api.listRuns() });
  const rules = useQuery({ queryKey: RULES_QUERY_KEY, queryFn: () => api.listRules() });
  const dataset = rules.data?.dataset ?? null;
  const live = (rules.data?.rules ?? []).filter((rule) => liveVersion(rule)).length;
  const start = useMutation({
    mutationFn: () => api.startRun(),
    onSuccess: (response) => {
      queryClient.setQueryData(runQueryKey(response.run.id), response);
      void queryClient.invalidateQueries({ queryKey: RUNS_QUERY_KEY, exact: true });
      onStarted(response.run);
    },
  });
  const blocked = !dataset ? "noData" : live === 0 ? "noRules" : null;
  const list = runs.data?.runs ?? [];

  return (
    <>
      <PageHeader title={t("runs.title")} subtitle={t("runs.subtitle")} />
      <Card className="mb-4">
        <h2 className="mb-2 text-lg font-bold">{t("runs.start.title")}</h2>
        {rules.isPending ? (
          <p className="mb-3 text-muted">{tUi("states.loading")}</p>
        ) : blocked ? (
          <p className="mb-3 text-muted">
            {t(`runs.start.${blocked}`)}{" "}
            <Link
              to={blocked === "noData" ? "/data" : "/rules"}
              className="font-semibold text-primary hover:underline"
            >
              {t(blocked === "noData" ? "runs.start.goToData" : "runs.start.goToRules")}
            </Link>
          </p>
        ) : dataset ? (
          <p className="mb-3">
            {t("runs.start.body", {
              dataset: dataset.name,
              transactions: formatCount(dataset.transactionCount, locale),
              rules: formatCount(live, locale),
            })}
          </p>
        ) : null}
        {start.isError ? (
          <p role="alert" className="mb-3 text-high">
            {apiErrorMessage(start.error, tUi)}
          </p>
        ) : null}
        <Button
          variant="primary"
          disabled={rules.isPending || blocked !== null || start.isPending}
          onClick={() => start.mutate()}
        >
          {t(start.isPending ? "runs.start.running" : "runs.start.button")}
        </Button>
      </Card>
      {runs.isPending ? <p className="text-muted">{tUi("states.loading")}</p> : null}
      {runs.isError ? <p className="text-high">{tUi("states.error")}</p> : null}
      {runs.data && list.length === 0 ? (
        <EmptyState title={t("runs.empty.title")}>{t("runs.empty.body")}</EmptyState>
      ) : null}
      {list.length > 0 ? (
        <Card>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th
                    key={column}
                    className={`${CELL} text-start text-sm font-semibold text-muted`}
                  >
                    {t(`runs.columns.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((run) => (
                <tr key={run.id} data-testid="run-row" className="align-top">
                  <td className={`${CELL} font-mono font-semibold`}>
                    <Link
                      to="/runs/$runId"
                      params={{ runId: run.id }}
                      className="text-primary hover:underline"
                    >
                      <bdi>{run.id}</bdi>
                    </Link>
                  </td>
                  <td className={CELL}>
                    <bdi>{run.dataset.name}</bdi>
                  </td>
                  <td className={`${CELL} text-sm`}>
                    <time dateTime={run.startedAt}>{formatMoment(run.startedAt, locale)}</time>
                    <div className="text-muted">
                      <bdi>{run.startedBy}</bdi>
                    </div>
                  </td>
                  <td className={CELL}>{formatCount(run.totals.findings, locale)}</td>
                  <td className={CELL}>{formatCount(run.totals.couldNotCheck, locale)}</td>
                  <td className={CELL}>
                    <RunStatusTag status={run.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </>
  );
}
