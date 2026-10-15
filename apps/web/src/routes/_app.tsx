import { AppShell, accountLinkClassName } from "@hrcc/ui";
import { meQueryOptions, setSignedInUser, useLocaleSwitch } from "@hrcc/ui/app";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { requireUser } from "../auth/guards";
import { signOut } from "../auth/session-actions";
import { RoleNav } from "../components/role-nav";
import { teamNameFor } from "../lib/team-name";

export const Route = createFileRoute("/_app")({
  beforeLoad: requireUser,
  component: AppLayout,
});

function AppLayout() {
  const { api, queryClient } = Route.useRouteContext();
  // Read the live user (not the beforeLoad snapshot) so a language change is not undone.
  const { data: user } = useQuery(meQueryOptions(api));
  const { t, i18n } = useTranslation("ui");
  const navigate = useNavigate();
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
      user={{
        displayName: user.displayName,
        role: user.role,
        teamName: teamNameFor(user.team, locale),
      }}
      nav={changing ? null : <RoleNav role={user.role} />}
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
        await signOut({ api, queryClient }).catch(() => undefined);
        await navigate({ to: "/sign-in" });
      }}
    >
      <Outlet />
    </AppShell>
  );
}
