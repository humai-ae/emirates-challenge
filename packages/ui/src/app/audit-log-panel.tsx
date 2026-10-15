import type { ApiClient, Locale } from "@hrcc/shared";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AuditLogTable } from "../components/audit-log-table";
import { Button } from "../components/button";
import { Card } from "../components/card";
import { IntegrityNotice } from "../components/integrity-notice";

const PAGE_SIZE = 50;

export function AuditLogPanel({ api, locale }: { api: ApiClient; locale: Locale }) {
  const { t } = useTranslation("ui");
  const queryClient = useQueryClient();
  const log = useInfiniteQuery({
    queryKey: ["audit", "list"],
    queryFn: ({ pageParam }) =>
      api.listAudit(
        pageParam === null ? { limit: PAGE_SIZE } : { before: pageParam, limit: PAGE_SIZE },
      ),
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) => lastPage.nextBefore,
  });
  const integrity = useMutation({
    mutationFn: () => api.checkIntegrity(),
    // The check itself is audited, so refresh the list.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["audit", "list"] }),
  });

  const events = log.data?.pages.flatMap((page) => page.events) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div>
          <Button onClick={() => integrity.mutate()} disabled={integrity.isPending}>
            {t("audit.checkIntegrity")}
          </Button>
        </div>
        {integrity.data ? <IntegrityNotice result={integrity.data} /> : null}
        {integrity.isError ? <p className="text-high">{t("states.error")}</p> : null}
      </Card>
      <Card>
        {log.isPending ? <p className="text-muted">{t("states.loading")}</p> : null}
        {log.isError ? <p className="text-high">{t("states.error")}</p> : null}
        {log.isSuccess ? <AuditLogTable events={events} locale={locale} /> : null}
        {log.hasNextPage ? (
          <div className="mt-3">
            <Button onClick={() => log.fetchNextPage()} disabled={log.isFetchingNextPage}>
              {t("audit.showMore")}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
