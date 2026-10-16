import type { ApiClient, FlagSummary } from "@hrcc/shared";
import { EmptyState, PageHeader } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import { teamNameFor } from "../../lib/team-name";
import { FlagRow } from "./flag-row";
import { FLAGS_QUERY_KEY } from "./queries";

function Group({
  title,
  flags,
  empty,
}: {
  title: string;
  flags: FlagSummary[];
  empty?: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-2 text-lg font-bold">
        {title}
      </h2>
      {flags.length === 0 && empty ? empty : null}
      <ul className="flex flex-col gap-3">
        {flags.map((flag) => (
          <FlagRow key={flag.id} flag={flag} reader="lead" showStatus />
        ))}
      </ul>
    </section>
  );
}

/** A lead's team's flags: sent back first, then to fix, then waiting for the analyst, then closed. */
export function QueuePage({ api }: { api: ApiClient }) {
  const { t } = useTranslation("web");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const queue = useQuery({
    queryKey: [...FLAGS_QUERY_KEY, "queue"],
    queryFn: () => api.getQueue(),
    staleTime: 0,
  });
  const data = queue.data;
  const team = data ? (teamNameFor(data.team, locale) ?? "") : "";
  const open = data ? [...data.sentBack, ...data.toFix] : [];
  return (
    <>
      <PageHeader
        title={t("queue.title")}
        subtitle={
          data
            ? t("queue.subtitle", {
                team,
                count: open.length,
                overdue: open.filter((flag) => flag.overdue).length,
              })
            : undefined
        }
      />
      {queue.isPending ? <p className="text-muted">{tUi("states.loading")}</p> : null}
      {queue.isError ? (
        <p role="alert" className="text-high">
          {tUi("states.error")}
        </p>
      ) : null}
      {data ? (
        <div className="flex flex-col gap-6">
          {data.sentBack.length > 0 ? (
            <Group title={t("queue.sentBack")} flags={data.sentBack} />
          ) : null}
          <Group
            title={t("queue.toFix")}
            flags={data.toFix}
            empty={
              <EmptyState title={t("queue.emptyTitle")}>
                {t("queue.emptyBody", { team })}
              </EmptyState>
            }
          />
          {data.waiting.length > 0 ? (
            <Group
              title={t("queue.waiting", { count: data.waiting.length })}
              flags={data.waiting}
            />
          ) : null}
          {data.closed.length > 0 ? (
            <Group title={t("queue.closed", { count: data.closed.length })} flags={data.closed} />
          ) : null}
        </div>
      ) : null}
    </>
  );
}
