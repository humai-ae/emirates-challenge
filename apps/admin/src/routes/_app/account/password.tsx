import { PageHeader } from "@hrcc/ui";
import { ChangePasswordForm, meQueryOptions } from "@hrcc/ui/app";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_app/account/password")({ component: ChangePasswordPage });

function ChangePasswordPage() {
  const { api } = Route.useRouteContext();
  const { data: user } = useQuery(meQueryOptions(api));
  const { t } = useTranslation("ui");
  const navigate = useNavigate();
  const required = user?.mustChangePassword ?? false;
  return (
    <>
      <PageHeader
        title={t(required ? "account.requiredTitle" : "account.title")}
        subtitle={required ? t("account.requiredBody") : undefined}
      />
      <ChangePasswordForm api={api} onChanged={() => void navigate({ to: "/home" })} />
    </>
  );
}
