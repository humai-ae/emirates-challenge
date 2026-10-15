import { type ApiClient, ApiError, type DemoUser, ROLES } from "@hrcc/shared";
import { Button, Card, LanguageSwitch, SyntheticBadge } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { teamNameFor } from "../../lib/team-name";

export function SignInPage({
  api,
  onSignIn,
}: {
  api: ApiClient;
  onSignIn: (userId: string) => Promise<void>;
}) {
  const { t } = useTranslation("web");
  const { t: tUi } = useTranslation("ui");
  const { locale, setLocale } = useLocaleSwitch();
  const demoUsers = useQuery({ queryKey: ["demo-users"], queryFn: () => api.getDemoUsers() });
  // Wrapped: TanStack Query passes a context object as a second argument.
  const signIn = useMutation({ mutationFn: (userId: string) => onSignIn(userId) });

  const disabled =
    demoUsers.error instanceof ApiError && demoUsers.error.body.code === "demo_auth_disabled";
  const byRole = new Map<DemoUser["role"], DemoUser[]>();
  for (const user of demoUsers.data?.users ?? []) {
    byRole.set(user.role, [...(byRole.get(user.role) ?? []), user]);
  }

  return (
    <div className="min-h-screen">
      <header className="bg-brand text-white">
        <div className="mx-auto flex max-w-[1120px] items-center gap-3 px-6 py-3">
          <span className="font-bold">{tUi("appName")}</span>
          <SyntheticBadge />
          <span className="flex-1" />
          <LanguageSwitch value={locale} onChange={(next) => void setLocale(next)} />
        </div>
      </header>
      <main className="mx-auto max-w-[1120px] px-6 py-8">
        <h1 className="mb-1 text-2xl font-bold">{t("signIn.title")}</h1>
        <p className="mb-6 text-muted">{t("signIn.subtitle")}</p>
        {disabled ? <p className="text-high">{t("signIn.disabled")}</p> : null}
        {demoUsers.isError && !disabled ? <p className="text-high">{tUi("states.error")}</p> : null}
        {demoUsers.isPending ? <p className="text-muted">{tUi("states.loading")}</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          {ROLES.filter((role) => byRole.has(role)).map((role) => (
            <Card key={role} className="flex flex-col gap-3">
              <h2 className="text-lg font-bold">{tUi(`roles.${role}`)}</h2>
              <p className="text-muted">{t(`signIn.roleHelp.${role}`)}</p>
              <div className="flex flex-col gap-2">
                {(byRole.get(role) ?? []).map((user) => (
                  <div key={user.id} className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="primary"
                      disabled={signIn.isPending}
                      onClick={() => signIn.mutate(user.id)}
                    >
                      {t("signIn.continueAs", { name: user.displayName })}
                    </Button>
                    {user.team ? (
                      <span className="text-sm text-muted">
                        <bdi>{teamNameFor(user.team, locale)}</bdi>
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
        {signIn.isError ? <p className="mt-4 text-high">{tUi("states.error")}</p> : null}
      </main>
    </div>
  );
}
