import type { ApiClient } from "@hrcc/shared";
import { PageHeader } from "@hrcc/ui";
import { useTranslation } from "react-i18next";
import { RoutingCard } from "./routing-card";
import { TeamsCard } from "./teams-card";

export function TeamsPage({ api }: { api: ApiClient }) {
  const { t } = useTranslation("admin");
  return (
    <>
      <PageHeader title={t("teams.title")} subtitle={t("teams.subtitle")} />
      <RoutingCard api={api} />
      <TeamsCard api={api} />
    </>
  );
}
