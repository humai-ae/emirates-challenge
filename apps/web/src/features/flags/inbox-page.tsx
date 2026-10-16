import { type ApiClient, FLAG_KINDS, type InboxQueryInput, SEVERITIES } from "@hrcc/shared";
import { Button, EmptyState, PageHeader, SelectField } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ChangeEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { teamNameFor } from "../../lib/team-name";
import { FlagRow } from "./flag-row";
import { formatMoment } from "./format";
import { FLAGS_QUERY_KEY } from "./queries";

type Filters = Pick<InboxQueryInput, "severity" | "kind" | "ruleId" | "teamId" | "runId">;

/** Flags waiting for the analyst's decision: most severe first, then oldest, with filters. */
export function InboxPage({ api }: { api: ApiClient }) {
  const { t } = useTranslation("web");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const [filters, setFilters] = useState<Filters>({});
  const inbox = useInfiniteQuery({
    queryKey: [...FLAGS_QUERY_KEY, "inbox", filters],
    queryFn: ({ pageParam }) => api.getInbox({ ...filters, after: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextAfter ?? undefined,
  });
  const first = inbox.data?.pages[0];
  const flags = inbox.data?.pages.flatMap((page) => page.flags) ?? [];
  const filterBy = (key: keyof Filters) => (event: ChangeEvent<HTMLSelectElement>) =>
    setFilters((current) => ({ ...current, [key]: event.target.value || undefined }) as Filters);

  return (
    <>
      <PageHeader title={t("inbox.title")} subtitle={t("inbox.subtitle")} />
      {inbox.isPending ? <p className="text-muted">{tUi("states.loading")}</p> : null}
      {inbox.isError ? (
        <p role="alert" className="text-high">
          {tUi("states.error")}
        </p>
      ) : null}
      {first && first.total === 0 ? (
        <EmptyState
          title={t("inbox.emptyTitle")}
          action={
            <Link to="/analyst/report" className="font-semibold text-primary underline">
              {t("inbox.toReport")}
            </Link>
          }
        >
          {first.lastRun
            ? t("inbox.emptyLastRun", {
                run: first.lastRun.id,
                time: formatMoment(first.lastRun.finishedAt, locale),
              })
            : t("inbox.emptyNoRun")}
        </EmptyState>
      ) : null}
      {first && first.total > 0 ? (
        <>
          <p data-testid="inbox-summary" className="mb-3 text-lg font-semibold">
            {t("inbox.summary", { total: first.total, high: first.bySeverity.High })}
          </p>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SelectField
              label={t("inbox.filters.severity")}
              value={filters.severity ?? ""}
              onChange={filterBy("severity")}
            >
              <option value="">{t("inbox.filters.allSeverities")}</option>
              {SEVERITIES.map((level) => (
                <option key={level} value={level}>
                  {t(`flags.severity.${level}`)}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t("inbox.filters.kind")}
              value={filters.kind ?? ""}
              onChange={filterBy("kind")}
            >
              <option value="">{t("inbox.filters.allKinds")}</option>
              {FLAG_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`flags.kind.${kind}`)}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t("inbox.filters.team")}
              value={filters.teamId ?? ""}
              onChange={filterBy("teamId")}
            >
              <option value="">{t("inbox.filters.allTeams")}</option>
              <option value="none">{t("flags.noTeam")}</option>
              {first.filters.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {teamNameFor(team, locale)}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t("inbox.filters.rule")}
              value={filters.ruleId ?? ""}
              onChange={filterBy("ruleId")}
            >
              <option value="">{t("inbox.filters.allRules")}</option>
              {first.filters.rules.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.id} · {rule.title}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t("inbox.filters.run")}
              value={filters.runId ?? ""}
              onChange={filterBy("runId")}
            >
              <option value="">{t("inbox.filters.allRuns")}</option>
              {first.filters.runs.map((run) => (
                <option key={run} value={run}>
                  {run}
                </option>
              ))}
            </SelectField>
          </div>
          <p className="mb-2 text-sm text-muted">
            {t("inbox.showing", { shown: flags.length, matching: first.matching })}
          </p>
          {flags.length === 0 ? <EmptyState title={t("inbox.noMatch")} /> : null}
          <ul className="flex flex-col gap-3">
            {flags.map((flag) => (
              <FlagRow key={flag.id} flag={flag} reader="analyst" />
            ))}
          </ul>
          {inbox.hasNextPage ? (
            <div className="mt-4">
              <Button
                disabled={inbox.isFetchingNextPage}
                onClick={() => void inbox.fetchNextPage()}
              >
                {t("inbox.more")}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
