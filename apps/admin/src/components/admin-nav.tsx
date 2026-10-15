import { navTabClassName } from "@hrcc/ui";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export function AdminNav() {
  const { t } = useTranslation("admin");
  return (
    <>
      <Link to="/setup" className={navTabClassName}>
        {t("nav.setup")}
      </Link>
      <Link to="/data" className={navTabClassName}>
        {t("nav.data")}
      </Link>
      <Link to="/rules" className={navTabClassName}>
        {t("nav.rules")}
      </Link>
      <Link to="/runs" className={navTabClassName}>
        {t("nav.runs")}
      </Link>
      <Link to="/dashboard" className={navTabClassName}>
        {t("nav.dashboard")}
      </Link>
      <Link to="/teams" className={navTabClassName}>
        {t("nav.teams")}
      </Link>
      <Link to="/audit" className={navTabClassName}>
        {t("nav.audit")}
      </Link>
    </>
  );
}
