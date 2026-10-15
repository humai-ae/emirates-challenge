import type { User } from "@hrcc/shared";
import { PageHeader } from "@hrcc/ui";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

const SHORTCUTS = [
  { to: "/setup", key: "setup" },
  { to: "/data", key: "data" },
  { to: "/rules", key: "rules" },
  { to: "/runs", key: "runs" },
  { to: "/dashboard", key: "dashboard" },
  { to: "/teams", key: "teams" },
  { to: "/users", key: "users" },
  { to: "/audit", key: "audit" },
] as const;

/** The admin's landing page: a greeting and every area of the console. */
export function HomePage({ user }: { user: User }) {
  const { t } = useTranslation("admin");
  return (
    <>
      <PageHeader
        title={t("home.greeting", { name: user.displayName })}
        subtitle={t("home.intro")}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {SHORTCUTS.map((shortcut) => (
          <Link
            key={shortcut.to}
            to={shortcut.to}
            className="block rounded-[14px] border border-line bg-white p-5 hover:border-primary"
          >
            <h2 className="mb-1 text-lg font-bold text-primary">{t(`nav.${shortcut.key}`)}</h2>
            <p className="text-muted">{t(`home.shortcuts.${shortcut.key}`)}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
