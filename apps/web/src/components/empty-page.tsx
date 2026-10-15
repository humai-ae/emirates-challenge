import { EmptyState, PageHeader } from "@hrcc/ui";
import { useTranslation } from "react-i18next";
import type { webEn } from "../locales/web-en";

export type EmptyPageKey = keyof typeof webEn.pages;

export function EmptyPage({
  page,
  values,
}: {
  page: EmptyPageKey;
  values?: Record<string, string>;
}) {
  const { t } = useTranslation("web");
  return (
    <>
      <PageHeader title={t(`pages.${page}.title`)} />
      <EmptyState title={t(`pages.${page}.emptyTitle`)}>
        {t(`pages.${page}.emptyBody`, values)}
      </EmptyState>
    </>
  );
}
