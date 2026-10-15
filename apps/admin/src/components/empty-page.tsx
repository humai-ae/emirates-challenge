import { EmptyState, PageHeader } from "@hrcc/ui";
import { useTranslation } from "react-i18next";
import type { adminEn } from "../locales/admin-en";

export type AdminPageKey = keyof typeof adminEn.pages;

export function EmptyPage({ page }: { page: AdminPageKey }) {
  const { t } = useTranslation("admin");
  return (
    <>
      <PageHeader title={t(`pages.${page}.title`)} />
      <EmptyState title={t(`pages.${page}.emptyTitle`)}>{t(`pages.${page}.emptyBody`)}</EmptyState>
    </>
  );
}
