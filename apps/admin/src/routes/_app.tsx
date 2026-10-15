import { AppShell, accountLinkClassName } from "@hrcc/ui";
import { meQueryOptions, setSignedInUser, useLocaleSwitch } from "@hrcc/ui/app";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { requireAdmin } from "../auth/guards";
import { AdminNav } from "../components/admin-nav";
import { WEB_SIGN_IN_URL } from "../config";

export const Route = createFileRoute("/_app")({
  beforeLoad: requireAdmin,
  component: AdminLayout,
});

function AdminLayout() {
  const { api, queryClient } = Route.useRouteContext();
  const { data: user } = useQuery(meQueryOptions(api));
  const { t, i18n } = useTranslation("ui");
  const { locale, setLocale } = useLocaleSwitch(async (next) => {
    const { user: updated } = await api.updatePreferences({ locale: next });
    setSignedInUser(queryClient, updated);
  });

  useEffect(() => {
    if (user && user.locale !== i18n.resolvedLanguage) void i18n.changeLanguage(user.locale);
  }, [user, i18n]);

  if (!user) return null;
  // A required password change comes first, so there is nowhere else to go yet.
  const changing = user.mustChangePassword;
  return (
    <AppShell
      user={{ displayName: user.displayName, role: user.role, teamName: null }}
      nav={changing ? null : <AdminNav />}
      locale={locale}
      onLocaleChange={(next) => void setLocale(next)}
      account={
        changing ? null : (
          <Link to="/account/password" className={accountLinkClassName}>
            {t("nav.changePassword")}
          </Link>
        )
      }
      onSignOut={async () => {
        await api.logout().catch(() => undefined);
        setSignedInUser(queryClient, null);
        window.location.assign(WEB_SIGN_IN_URL);
      }}
    >
      <Outlet />
    </AppShell>
  );
}
