import type { Role } from "@hrcc/shared";
import { navTabClassName } from "@hrcc/ui";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export function RoleNav({ role }: { role: Role }) {
  const { t } = useTranslation("web");
  switch (role) {
    case "analyst":
      return (
        <>
          <Link to="/analyst/report" className={navTabClassName}>
            {t("nav.report")}
          </Link>
          <Link to="/analyst/inbox" className={navTabClassName}>
            {t("nav.inbox")}
          </Link>
          <Link to="/analyst/fix-checks" className={navTabClassName}>
            {t("nav.fixChecks")}
          </Link>
          <Link to="/analyst/second-opinions" className={navTabClassName}>
            {t("nav.secondOpinions")}
          </Link>
          <Link to="/analyst/requests" className={navTabClassName}>
            {t("nav.requests")}
          </Link>
        </>
      );
    case "lead":
      return (
        <Link to="/lead/queue" className={navTabClassName}>
          {t("nav.queue")}
        </Link>
      );
    case "auditor":
      return (
        <>
          <Link to="/audit/overview" className={navTabClassName}>
            {t("nav.overview")}
          </Link>
          <Link to="/audit/flags" className={navTabClassName}>
            {t("nav.findings")}
          </Link>
          <Link to="/audit/log" className={navTabClassName}>
            {t("nav.auditLog")}
          </Link>
          <Link to="/audit/evidence" className={navTabClassName}>
            {t("nav.evidence")}
          </Link>
          <Link to="/audit/rules" className={navTabClassName}>
            {t("nav.rules")}
          </Link>
        </>
      );
    case "admin":
      return null;
  }
}
