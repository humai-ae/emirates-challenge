import type { Role } from "@hrcc/shared";
import { navTabClassName } from "@hrcc/ui";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

const TABS = {
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

/** Home first, then the role's areas. The admin console has its own navigation. */
export function RoleNav({ role }: { role: Role }) {
  const { t } = useTranslation("web");
  if (role === "admin") return null;
  return (
    <>
      <Link to="/home" className={navTabClassName}>
        {t("nav.home")}
      </Link>
      {TABS[role].map((tab) => (
        <Link key={tab.to} to={tab.to} className={navTabClassName}>
          {t(`nav.${tab.key}`)}
        </Link>
      ))}
    </>
  );
}
