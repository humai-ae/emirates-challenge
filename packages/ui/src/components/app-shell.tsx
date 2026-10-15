import type { Locale, Role } from "@hrcc/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitch } from "./language-switch";
import { SyntheticBadge } from "./synthetic-badge";

export const navTabClassName =
  "whitespace-nowrap border-b-[3px] border-transparent px-3.5 py-2.5 font-medium text-tab-idle hover:text-white data-[status=active]:border-tab-active data-[status=active]:font-bold data-[status=active]:text-white";

export function NavCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ms-1.5 rounded-full bg-tab-active px-1.5 text-xs font-bold text-[#3d2c00]">
      {count}
    </span>
  );
}

export interface ShellUser {
  displayName: string;
  role: Role;
  teamName: string | null;
}

export function AppShell({
  user,
  nav,
  locale,
  onLocaleChange,
  signOutLabel,
  onSignOut,
  children,
}: {
  user: ShellUser;
  nav: ReactNode;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  signOutLabel: "switchRole" | "signOut";
  onSignOut: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation("ui");
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-brand text-white">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-3 px-6 py-3">
          <span className="text-base font-bold">{t("appName")}</span>
          <SyntheticBadge />
          <span className="flex-1" />
          <LanguageSwitch value={locale} onChange={onLocaleChange} />
          <span data-testid="who" className="text-sm text-[#dce4f2]">
            <bdi>{user.displayName}</bdi> · {t(`roles.${user.role}`)}
            {user.teamName ? (
              <>
                , <bdi>{user.teamName}</bdi>
              </>
            ) : null}
          </span>
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-lg border border-[#6d84ad] px-3 py-1 text-sm hover:bg-brand-strong"
          >
            {t(`nav.${signOutLabel}`)}
          </button>
        </div>
        <nav
          aria-label={t("nav.label")}
          className="mx-auto flex max-w-[1120px] gap-1 overflow-x-auto px-6"
        >
          {nav}
        </nav>
      </header>
      <main className="mx-auto max-w-[1120px] px-6 pt-7 pb-28">{children}</main>
    </div>
  );
}
