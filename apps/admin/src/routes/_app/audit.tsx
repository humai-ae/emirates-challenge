import { PageHeader } from "@hrcc/ui";
import { AuditLogPanel, useLocaleSwitch } from "@hrcc/ui/app";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_app/audit")({ component: AuditPage });

function AuditPage() {
  const { api } = Route.useRouteContext();
  const { t } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  return (
    <>
      <PageHeader title={t("audit.title")} subtitle={t("audit.subtitle")} />
      <AuditLogPanel api={api} locale={locale} />
    </>
  );
}
