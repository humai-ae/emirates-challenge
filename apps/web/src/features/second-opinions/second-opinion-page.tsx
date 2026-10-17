import { type ApiClient, ApiError, type SecondOpinionResponse } from "@hrcc/shared";
import { apiErrorMessage, Button, Card, EmptyState, Tag } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatMoment } from "../flags/format";
import { OPINIONS_LIST_QUERY_KEY, opinionQueryKey, percentOf } from "./queries";

/**
 * One second opinion: the rule's words, the transaction, and AI's view. An analyst marks it noted
 * or asks an admin to review the rule; neither changes a finding.
 */
export function SecondOpinionPage({ api, opinionId }: { api: ApiClient; opinionId: string }) {
  const { t } = useTranslation("web");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: opinionQueryKey(opinionId),
    queryFn: () => api.getSecondOpinion(opinionId),
    // One that isn't there stays that way: no retry.
    retry: (failures, error) => !(error instanceof ApiError && error.status < 500) && failures < 1,
  });
  const actions = {
    onSuccess: (response: SecondOpinionResponse) => {
      queryClient.setQueryData(opinionQueryKey(opinionId), response);
      void queryClient.invalidateQueries({ queryKey: OPINIONS_LIST_QUERY_KEY });
    },
    // Someone else acted first: show it as it is now.
    onError: () => void queryClient.invalidateQueries({ queryKey: opinionQueryKey(opinionId) }),
  };
  const note = useMutation({ mutationFn: () => api.noteSecondOpinion(opinionId), ...actions });
  const review = useMutation({ mutationFn: () => api.askRuleReview(opinionId), ...actions });

  if (query.isPending) return <p className="text-muted">{tUi("states.loading")}</p>;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <EmptyState title={t("secondOpinions.notFound")} action={<BackLink />}>
          {t("secondOpinions.notFoundBody")}
        </EmptyState>
      );
    }
    return (
      <p role="alert" className="text-high">
        {tUi("states.error")}
      </p>
    );
  }
  const { opinion } = query.data;
  const failed = note.error ?? review.error;
  return (
    <>
      <BackLink />
      <header className="mt-2 mb-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Tag tone={opinion.code === "flagged" ? "warn" : "info"}>
            {t(`secondOpinions.code.${opinion.code}`)}
          </Tag>
          <Tag tone="ai">
            {t("secondOpinions.strength", { percent: percentOf(opinion.strength) })}
          </Tag>
        </div>
        <h1 className="text-2xl font-bold leading-tight">
          <bdi>{opinion.ruleId}</bdi> · <bdi>{opinion.ruleTitle}</bdi>
        </h1>
        <p className="mt-1 text-sm text-muted">
          <bdi className="font-mono">{opinion.transactionId ?? "—"}</bdi> ·{" "}
          {t("secondOpinions.row", { row: opinion.rowNo })} ·{" "}
          <bdi className="font-mono">{opinion.runId}</bdi>
        </p>
        <p className="mt-3 rounded-[10px] bg-ai-bg px-3.5 py-2.5 text-sm text-ai">
          {t("secondOpinions.never")}
        </p>
      </header>
      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-4">
          <Section title={t("secondOpinions.rule")} testId="opinion-rule">
            <p dir="auto" className="whitespace-pre-line">
              {opinion.ruleText}
            </p>
          </Section>
          <Section title={t("secondOpinions.transaction")} testId="opinion-transaction">
            {opinion.transaction.length === 0 ? (
              <p className="text-sm text-muted">{t("secondOpinions.deleted")}</p>
            ) : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {opinion.transaction.map((item) => (
                  <div key={item.column} className="contents">
                    <dt className="text-muted">
                      <bdi>{item.column}</bdi>
                    </dt>
                    <dd>
                      <bdi>{item.value || "—"}</bdi>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </Section>
        </div>
        <div className="flex flex-col gap-4">
          <Section title={t("secondOpinions.view")} testId="opinion-view">
            <p className="font-semibold">{t(`secondOpinions.code.${opinion.code}`)}</p>
            <p className="mt-1 text-ai">
              {t("secondOpinions.likelyAsWritten", { percent: percentOf(opinion.pBreak) })}
            </p>
            <p className="mt-1 text-sm text-muted">
              {t("secondOpinions.enough", { percent: percentOf(opinion.enough) })}
            </p>
            {opinion.flagId ? (
              <Link
                to="/analyst/flags/$flagId"
                params={{ flagId: opinion.flagId }}
                className="mt-3 inline-block font-semibold text-primary hover:underline"
              >
                {t("secondOpinions.openFlag", { id: opinion.flagId })}
              </Link>
            ) : null}
          </Section>
          <Section title={t("secondOpinions.actions")} testId="opinion-actions">
            <p className="text-sm text-muted">{t("secondOpinions.actionsHint")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                disabled={opinion.noted !== null || note.isPending}
                onClick={() => note.mutate()}
              >
                {t("secondOpinions.markNoted")}
              </Button>
              <Button
                disabled={opinion.reviewRequested !== null || review.isPending}
                onClick={() => review.mutate()}
              >
                {t("secondOpinions.askReview")}
              </Button>
            </div>
            {opinion.noted ? (
              <p className="mt-3 text-sm">
                {t("secondOpinions.notedOn", {
                  by: opinion.noted.by,
                  time: formatMoment(opinion.noted.at, locale),
                })}
              </p>
            ) : null}
            {opinion.reviewRequested ? (
              <p className="mt-1 text-sm">
                {t("secondOpinions.reviewOn", {
                  by: opinion.reviewRequested.by,
                  time: formatMoment(opinion.reviewRequested.at, locale),
                })}
              </p>
            ) : null}
            {failed ? (
              <p role="alert" className="mt-3 text-sm text-high">
                {apiErrorMessage(failed, tUi)}
              </p>
            ) : null}
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <Card data-testid={testId}>
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </Card>
  );
}

function BackLink() {
  const { t } = useTranslation("web");
  return (
    <Link
      to="/analyst/second-opinions"
      className="text-sm font-semibold text-primary hover:underline"
    >
      <span aria-hidden="true" className="inline-block rtl:-scale-x-100">
        ←
      </span>{" "}
      {t("secondOpinions.back")}
    </Link>
  );
}
