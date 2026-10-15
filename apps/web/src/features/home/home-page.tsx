import type { User } from "@hrcc/shared";
import { PageHeader } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { teamNameFor } from "../../lib/team-name";

const SHORTCUTS = {
  analyst: [
    { to: "/analyst/report", key: "report" },
    { to: "/analyst/inbox", key: "inbox" },
    { to: "/analyst/fix-checks", key: "fixChecks" },
    { to: "/analyst/second-opinions", key: "secondOpinions" },
    { to: "/analyst/requests", key: "requests" },
  ],
  lead: [{ to: "/lead/queue", key: "queue" }],
  auditor: [
    { to: "/audit/overview", key: "overview" },
    { to: "/audit/flags", key: "findings" },
    { to: "/audit/log", key: "auditLog" },
    { to: "/audit/evidence", key: "evidence" },
    { to: "/audit/rules", key: "rules" },
  ],
} as const;

/** The landing page after sign-in: a greeting and the role's areas. */
export function HomePage({ user }: { user: User }) {
  const { t } = useTranslation("web");
  const { locale } = useLocaleSwitch();
  if (user.role === "admin") return null;
  const team = teamNameFor(user.team, locale) ?? "";
  return (
    <>
      <PageHeader
        title={t("home.greeting", { name: user.displayName })}
        subtitle={t(`home.intro.${user.role}`, { team })}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {SHORTCUTS[user.role].map((shortcut) => (
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
