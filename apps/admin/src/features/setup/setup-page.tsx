import type { ApiClient } from "@hrcc/shared";
import { Card, PageHeader, Tag } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { DATASETS_QUERY_KEY } from "../data/datasets-query";
import { formatCount } from "../data/format";
import { liveVersion } from "../rules/rule-status";
import { RULES_QUERY_KEY } from "../rules/rules-query";

type StepState = "done" | "todo" | "later";
const TONES = { done: "ok", todo: "warn", later: "neutral" } as const;
const LINK = "font-semibold text-primary hover:underline";

function Step({
  number,
  title,
  state,
  children,
}: {
  number: number;
  title: string;
  state: StepState;
  children: ReactNode;
}) {
  const { t } = useTranslation("admin");
  return (
    <li data-testid="setup-step" className="flex gap-4 border-b border-line py-4 last:border-b-0">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-soft font-bold">
        {number}
      </span>
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold">{title}</h2>
          <Tag tone={TONES[state]}>{t(`setup.state.${state}`)}</Tag>
        </div>
        <div className="text-muted">{children}</div>
      </div>
    </li>
  );
}

/** The four files that get the checker ready; the finding format arrives with checks. */
export function SetupPage({ api }: { api: ApiClient }) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const datasets = useQuery({ queryKey: DATASETS_QUERY_KEY, queryFn: () => api.listDatasets() });
  const rules = useQuery({ queryKey: RULES_QUERY_KEY, queryFn: () => api.listRules() });
  const ruleCount = rules.data?.rules.length ?? 0;
  const liveCount = rules.data?.rules.filter((rule) => liveVersion(rule)).length ?? 0;
  // The list is newest first.
  const latest = datasets.data?.datasets.find((dataset) => dataset.status !== "deleted");
  // A rejected dataset is uploaded but not usable until a column is picked for it.
  const usable = latest?.status === "ready";
  const datasetLink = (label: string) =>
    latest ? (
      <Link to="/data/$datasetId" params={{ datasetId: latest.id }} className={LINK}>
        {label}
      </Link>
    ) : null;

  return (
    <>
      <PageHeader title={t("setup.title")} subtitle={t("setup.subtitle")} />
      {datasets.isPending ? <p className="text-muted">{tUi("states.loading")}</p> : null}
      {datasets.isError ? <p className="text-high">{tUi("states.error")}</p> : null}
      {datasets.data ? (
        <Card>
          <ol>
            <Step number={1} title={t("setup.steps.data.title")} state={usable ? "done" : "todo"}>
              {latest && usable ? (
                <>
                  <bdi className="font-semibold">{latest.name}</bdi>
                  {" · "}
                  {t("setup.steps.data.done", {
                    transactions: formatCount(latest.transactionCount, locale),
                    employees: formatCount(latest.employeeCount, locale),
                  })}{" "}
                  <Link to="/data" className={LINK}>
                    {t("setup.steps.data.action")}
                  </Link>
                </>
              ) : latest ? (
                <>
                  <bdi className="font-semibold">{latest.name}</bdi>{" "}
                  {t("setup.steps.data.rejected")} {datasetLink(t("setup.steps.columns.action"))}
                </>
              ) : (
                <>
                  {t("setup.steps.data.todo")}{" "}
                  <Link to="/data" className={LINK}>
                    {t("setup.steps.data.action")}
                  </Link>
                </>
              )}
            </Step>
            <Step
              number={2}
              title={t("setup.steps.columns.title")}
              state={usable && latest?.columnsConfirmed ? "done" : "todo"}
            >
              {!latest ? (
                t("setup.steps.columns.waiting")
              ) : usable && latest.columnsConfirmed ? (
                t("setup.steps.columns.done")
              ) : (
                <>
                  {t("setup.steps.columns.todo")} {datasetLink(t("setup.steps.columns.action"))}
                </>
              )}
            </Step>
            <Step
              number={3}
              title={t("setup.steps.policy.title")}
              state={ruleCount > 0 ? "done" : "todo"}
            >
              {ruleCount > 0 ? (
                <>
                  {t("setup.steps.policy.done", {
                    total: formatCount(ruleCount, locale),
                    live: formatCount(liveCount, locale),
                  })}{" "}
                  <Link to="/rules" className={LINK}>
                    {t("setup.steps.policy.action")}
                  </Link>
                </>
              ) : !usable ? (
                t("setup.steps.policy.waiting")
              ) : (
                <>
                  {t("setup.steps.policy.todo")}{" "}
                  <Link to="/rules" className={LINK}>
                    {t("setup.steps.policy.action")}
                  </Link>
                </>
              )}
            </Step>
            <Step number={4} title={t("setup.steps.findings.title")} state="later">
              {t("setup.steps.findings.later")}
            </Step>
          </ol>
        </Card>
      ) : null}
    </>
  );
}
