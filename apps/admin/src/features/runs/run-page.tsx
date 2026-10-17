import type { ApiClient, RunTotals } from "@hrcc/shared";
import { apiErrorMessage, Button, Card } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { formatCount, formatMoment, formatSeconds } from "../data/format";
import { RunResults } from "./run-results";
import { RunStatusTag } from "./run-status-tag";
import { runQueryKey } from "./runs-query";
import { WorkedExamples } from "./worked-examples";

const CELL = "border-b border-line px-2.5 py-2";
const RULE_COLUMNS = [
  "rule",
  "findings",
  "couldNotCheck",
  "passed",
  "notApplicable",
  "waitingForAi",
] as const;
/** A link that looks like the primary button: the browser downloads the export itself. */
const DOWNLOAD =
  "inline-flex items-center gap-2 rounded-[10px] border border-primary bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-strong";

export function RunPage({ api, runId }: { api: ApiClient; runId: string }) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: runQueryKey(runId),
    queryFn: () => api.getRun(runId),
    // While AI reads texts, ranks patterns or gives its second opinion, the page follows it.
    refetchInterval: (current) => {
      const totals = current.state.data?.run.totals;
      return (totals?.waitingForAi ?? 0) > 0 ||
        totals?.findingPatterns ||
        totals?.secondOpinionState === "running"
        ? 3_000
        : false;
    },
  });
  const retry = useMutation({
    mutationFn: () => api.retryAiChecks(runId),
    onSuccess: (data) => queryClient.setQueryData(runQueryKey(runId), data),
  });

  if (query.isPending) return <p className="text-muted">{tUi("states.loading")}</p>;
  if (query.isError) return <p className="text-high">{tUi("states.error")}</p>;
  const { run, workedExamples, exportReady } = query.data;
  const count = (value: number) => formatCount(value, locale);
  const totals = [
    ["transactions", run.totals.transactions],
    ["findings", run.totals.findings],
    ["couldNotCheck", run.totals.couldNotCheck],
    ["waitingForAi", run.totals.waitingForAi],
    ["newFlags", run.totals.newFlags],
    ["seenAgain", run.totals.seenAgain],
    ["patterns", run.totals.patterns],
  ] as const;

  return (
    <>
      <Link
        to="/runs"
        className="mb-2 inline-block text-sm font-semibold text-primary hover:underline"
      >
        {t("runs.back")}
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-bold leading-tight">
            <bdi>{run.id}</bdi>
          </h1>
          <p className="text-muted">
            {t("runs.started", {
              dataset: run.dataset.name,
              date: formatMoment(run.startedAt, locale),
              name: run.startedBy,
              seconds: formatSeconds(run.totals.durationMs, locale),
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RunStatusTag status={run.status} />
          {exportReady ? (
            <a href={api.runExportUrl(run.id)} download className={DOWNLOAD}>
              {t("runs.export.button")}
            </a>
          ) : null}
        </div>
      </div>
      {run.status === "complete_with_errors" ? (
        <div
          role="alert"
          className="mb-4 rounded-[10px] bg-warn-bg px-3.5 py-2.5 text-sm text-warn"
        >
          {t("runs.errorsBanner")}
        </div>
      ) : null}
      {exportReady ? null : (
        <p className="mb-4 text-sm text-muted">
          {t("runs.export.notReady")}{" "}
          <Link to="/finding-format" className="font-semibold text-primary hover:underline">
            {t("runs.export.goToFormat")}
          </Link>
        </p>
      )}
      {run.totals.findingPatterns ? (
        <p role="status" className="mb-4 rounded-[10px] bg-ai-bg px-3.5 py-2.5 text-sm text-ai">
          {t("runs.patterns.looking")}
        </p>
      ) : null}
      <SecondOpinionStatus totals={run.totals} />
      {run.totals.waitingForAi > 0 ? (
        <p role="status" className="mb-4 rounded-[10px] bg-ai-bg px-3.5 py-2.5 text-sm text-ai">
          {t("runs.ai.waiting", { count: count(run.totals.waitingForAi) })}
        </p>
      ) : null}
      {run.totals.aiFailed > 0 ? (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-warn-bg px-3.5 py-2.5 text-sm text-warn"
        >
          <span>{t("runs.ai.failed", { count: count(run.totals.aiFailed) })}</span>
          <Button disabled={retry.isPending} onClick={() => retry.mutate()}>
            {t("runs.ai.retry")}
          </Button>
          {retry.isError ? (
            <span className="w-full">{apiErrorMessage(retry.error, tUi)}</span>
          ) : null}
        </div>
      ) : null}
      <dl className="mb-4 grid gap-4 md:grid-cols-4">
        {totals.map(([key, value]) => (
          <div
            key={key}
            data-testid="run-total"
            className="rounded-[14px] border border-line bg-white p-4"
          >
            <dt className="text-sm text-muted">{t(`runs.totals.${key}`)}</dt>
            <dd className="text-xl font-bold">{count(value)}</dd>
          </div>
        ))}
      </dl>
      <Card className="mb-4">
        <h2 className="mb-3 text-lg font-bold">{t("runs.rulesTable.title")}</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {RULE_COLUMNS.map((column) => (
                <th key={column} className={`${CELL} text-start text-sm font-semibold text-muted`}>
                  {t(`runs.rulesTable.${column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {run.rules.map((rule) => (
              <tr key={rule.ruleId} data-testid="run-rule" className="align-top">
                <td className={CELL}>
                  <Link
                    to="/rules/$ruleId"
                    params={{ ruleId: rule.ruleId }}
                    className="font-mono font-semibold text-primary hover:underline"
                  >
                    <bdi>{rule.ruleId}</bdi>
                  </Link>{" "}
                  <bdi>{rule.title}</bdi>
                  {rule.error ? (
                    <p className="text-sm text-high">
                      {t("runs.rulesTable.couldNotRun", { error: rule.error })}
                    </p>
                  ) : null}
                </td>
                <td className={CELL}>{count(rule.counts.flagged)}</td>
                <td className={CELL}>{count(rule.counts.could_not_check)}</td>
                <td className={CELL}>{count(rule.counts.passed)}</td>
                <td className={CELL}>{count(rule.counts.not_applicable)}</td>
                <td className={CELL}>{count(rule.counts.needs_judgment)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <RunResults api={api} run={run} />
      <WorkedExamples examples={workedExamples} />
    </>
  );
}

/** How far AI's second opinion got, and how many transactions it strongly disagreed on. */
function SecondOpinionStatus({ totals }: { totals: RunTotals }) {
  const { t } = useTranslation("admin");
  const { locale } = useLocaleSwitch();
  const state = totals.secondOpinionState;
  if (state === "off") return null;
  const said =
    state === "running"
      ? "runs.secondOpinion.running"
      : state === "failed"
        ? "runs.secondOpinion.failed"
        : totals.disagreements > 0
          ? "runs.secondOpinion.done"
          : "runs.secondOpinion.agreed";
  return (
    <p role="status" className="mb-4 rounded-[10px] bg-ai-bg px-3.5 py-2.5 text-sm text-ai">
      {t(said, {
        done: formatCount(totals.secondOpinionDone, locale),
        total: formatCount(totals.secondOpinionTotal, locale),
        count: formatCount(totals.disagreements, locale),
      })}
    </p>
  );
}
