import type { ApiClient } from "@hrcc/shared";
import { EmptyState, PageHeader } from "@hrcc/ui";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FlagRow } from "./flag-row";
import { FLAGS_QUERY_KEY } from "./queries";

/** Fixes the teams have submitted: the analyst checks each and closes it or sends it back. */
export function FixChecksPage({ api }: { api: ApiClient }) {
  const { t } = useTranslation("web");
  const { t: tUi } = useTranslation("ui");
  const checks = useQuery({
    queryKey: [...FLAGS_QUERY_KEY, "fix-checks"],
    queryFn: () => api.getFixChecks(),
    staleTime: 0,
  });
  return (
    <>
      <PageHeader title={t("fixChecks.title")} subtitle={t("fixChecks.subtitle")} />
      {checks.isPending ? <p className="text-muted">{tUi("states.loading")}</p> : null}
      {checks.isError ? (
        <p role="alert" className="text-high">
          {tUi("states.error")}
        </p>
      ) : null}
      {checks.data && checks.data.flags.length === 0 ? (
        <EmptyState title={t("fixChecks.emptyTitle")}>{t("fixChecks.emptyBody")}</EmptyState>
      ) : null}
      <ul className="flex flex-col gap-3">
        {(checks.data?.flags ?? []).map((flag) => (
          <FlagRow key={flag.id} flag={flag} reader="analyst" showFix />
        ))}
      </ul>
    </>
  );
}
