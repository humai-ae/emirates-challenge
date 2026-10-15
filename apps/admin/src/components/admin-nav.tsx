import { navTabClassName } from "@hrcc/ui";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

const TABS = [
  { to: "/home", key: "home" },
  { to: "/setup", key: "setup" },
  { to: "/data", key: "data" },
  { to: "/rules", key: "rules" },
  { to: "/runs", key: "runs" },
  { to: "/dashboard", key: "dashboard" },
  { to: "/teams", key: "teams" },
  { to: "/users", key: "users" },
  { to: "/audit", key: "audit" },
] as const;

export function AdminNav() {
  const { t } = useTranslation("admin");
  return (
    <>
      {TABS.map((tab) => (
        <Link key={tab.to} to={tab.to} className={navTabClassName}>
          {t(`nav.${tab.key}`)}
        </Link>
      ))}
    </>
  );
}
