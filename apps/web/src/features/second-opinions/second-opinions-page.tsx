import type { ApiClient, SecondOpinion } from "@hrcc/shared";
import { Card, cx, EmptyState, PageHeader, Tag } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { formatNumber } from "../flags/format";
import { OPINIONS_LIST_QUERY_KEY, percentOf } from "./queries";

/** Where AI strongly disagrees with a rule's check in the newest run, the strongest first. */
export function SecondOpinionsPage({ api }: { api: ApiClient }) {
  const { t } = useTranslation("web");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const list = useQuery({
    queryKey: OPINIONS_LIST_QUERY_KEY,
    queryFn: () => api.listSecondOpinions(),
    // While AI still reads the run, the list grows: the page follows it.
    refetchInterval: (current) =>
      current.state.data?.progress?.state === "running" ? 3_000 : false,
  });
  const data = list.data;
  const progress = data?.progress ?? null;
  return (
    <>
      <PageHeader title={t("secondOpinions.title")} subtitle={t("secondOpinions.subtitle")} />
      {list.isPending ? <p className="text-muted">{tUi("states.loading")}</p> : null}
      {list.isError ? (
        <p role="alert" className="text-high">
          {tUi("states.error")}
        </p>
      ) : null}
      {progress?.state === "running" ? (
        <p role="status" className="mb-3 rounded-[10px] bg-ai-bg px-3.5 py-2.5 text-sm text-ai">
          {t("secondOpinions.running", {
            done: formatNumber(progress.done, locale),
            transactions: formatNumber(progress.transactions, locale),
          })}
        </p>
      ) : null}
      {progress?.state === "failed" ? (
        <p role="status" className="mb-3 rounded-[10px] bg-warn-bg px-3.5 py-2.5 text-sm text-warn">
          {t("secondOpinions.failed")}
        </p>
      ) : null}
      {data && data.opinions.length === 0 ? (
        <EmptyState title={t("secondOpinions.emptyTitle")}>
          {t("secondOpinions.emptyBody")}
        </EmptyState>
      ) : null}
      {data?.runId && data.opinions.length > 0 ? (
        <>
          <p className="mb-3 text-sm text-muted">
            {t(
              data.total > data.opinions.length
                ? "secondOpinions.summary"
                : "secondOpinions.summaryAll",
              {
                runId: data.runId,
                total: formatNumber(data.total, locale),
                shown: formatNumber(data.opinions.length, locale),
              },
            )}
          </p>
          <ul className="flex flex-col gap-3">
            {data.opinions.map((opinion) => (
              <OpinionRow key={opinion.id} opinion={opinion} />
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

/** One disagreement: what the check found, what AI thinks, and how strongly. Noted ones are muted. */
function OpinionRow({ opinion }: { opinion: SecondOpinion }) {
  const { t } = useTranslation("web");
  const noted = opinion.noted !== null;
  return (
    <li data-testid="second-opinion" data-noted={noted ? "true" : undefined}>
      <Card className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone={noted ? "neutral" : opinion.code === "flagged" ? "warn" : "info"}>
            {t(`secondOpinions.code.${opinion.code}`)}
          </Tag>
          <Tag tone={noted ? "neutral" : "ai"}>
            {t("secondOpinions.likely", { percent: percentOf(opinion.pBreak) })}
          </Tag>
          {opinion.noted ? <Tag>{t("secondOpinions.noted", { by: opinion.noted.by })}</Tag> : null}
          {opinion.reviewRequested ? (
            <Tag tone="info">
              {t("secondOpinions.reviewAsked", { by: opinion.reviewRequested.by })}
            </Tag>
          ) : null}
        </div>
        <Link
          to="/analyst/second-opinions/$opinionId"
          params={{ opinionId: opinion.id }}
          className={cx("text-primary hover:underline", noted ? "font-normal" : "font-semibold")}
        >
          <bdi>{opinion.ruleId}</bdi> · <bdi>{opinion.ruleTitle}</bdi>
        </Link>
        <p className="text-sm text-muted">
          <bdi className="font-mono">{opinion.transactionId ?? "—"}</bdi> ·{" "}
          {t("secondOpinions.row", { row: opinion.rowNo })} ·{" "}
          {t("secondOpinions.strength", { percent: percentOf(opinion.strength) })}
        </p>
      </Card>
    </li>
  );
}
