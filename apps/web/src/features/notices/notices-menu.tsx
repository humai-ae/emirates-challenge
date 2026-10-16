import type { ApiClient, Notice, NoticesResponse, Role } from "@hrcc/shared";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoment } from "../flags/format";
import { COUNTS_QUERY_KEY, NOTICES_QUERY_KEY } from "../flags/queries";

/** Where a notice leads: the flag's page for the reader's role, or the analyst's rule requests. */
function NoticeLink({
  notice,
  userRole,
  onOpen,
  children,
}: {
  notice: Notice;
  userRole: Role;
  onOpen: () => void;
  children: ReactNode;
}) {
  const className = "block rounded-[10px] px-2 py-1.5 text-start hover:bg-soft";
  const flagId = notice.params.flagId;
  if (flagId && userRole === "lead") {
    return (
      <Link to="/lead/flags/$flagId" params={{ flagId }} className={className} onClick={onOpen}>
        {children}
      </Link>
    );
  }
  if (flagId && userRole === "analyst") {
    return (
      <Link to="/analyst/flags/$flagId" params={{ flagId }} className={className} onClick={onOpen}>
        {children}
      </Link>
    );
  }
  if (userRole === "analyst") {
    return (
      <Link to="/analyst/requests" className={className} onClick={onOpen}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={`${className} w-full`} onClick={onOpen}>
      {children}
    </button>
  );
}

/** The header's notices: what changed for the reader, newest first. */
export function NoticesMenu({ api, userRole }: { api: ApiClient; userRole: Role }) {
  const { t } = useTranslation("web");
  const { locale } = useLocaleSwitch();
  const queryClient = useQueryClient();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const notices = useQuery({
    queryKey: NOTICES_QUERY_KEY,
    queryFn: () => api.listNotices(),
    refetchInterval: 30_000,
  });
  const refresh = (response: NoticesResponse) => {
    queryClient.setQueryData(NOTICES_QUERY_KEY, response);
    void queryClient.invalidateQueries({ queryKey: COUNTS_QUERY_KEY });
  };
  const readOne = useMutation({
    mutationFn: (id: string) => api.readNotice(id),
    onSuccess: refresh,
  });
  const readAll = useMutation({ mutationFn: () => api.readAllNotices(), onSuccess: refresh });
  const unread = notices.data?.unread ?? 0;
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="rounded-lg border border-[#6d84ad] px-3 py-1 text-sm hover:bg-brand-strong"
      >
        {t("notices.button")}
        {unread > 0 ? (
          <span className="ms-1.5 rounded-full bg-tab-active px-1.5 text-xs font-bold text-[#3d2c00]">
            {unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <section
          id={panelId}
          aria-label={t("notices.title")}
          className="absolute end-0 z-30 mt-2 w-[22rem] max-w-[90vw] rounded-[14px] border border-line bg-white p-3 text-ink shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="font-bold">{t("notices.title")}</h2>
            {unread > 0 ? (
              <button
                type="button"
                className="text-sm text-primary underline"
                onClick={() => readAll.mutate()}
              >
                {t("notices.readAll")}
              </button>
            ) : null}
          </div>
          {notices.data && notices.data.notices.length === 0 ? (
            <p className="text-sm text-muted">{t("notices.none")}</p>
          ) : null}
          <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto">
            {(notices.data?.notices ?? []).map((notice) => (
              <li key={notice.id}>
                <NoticeLink
                  notice={notice}
                  userRole={userRole}
                  onOpen={() => {
                    setOpen(false);
                    if (!notice.readAt) readOne.mutate(notice.id);
                  }}
                >
                  <span className={notice.readAt ? "text-muted" : "font-semibold"}>
                    {t(`notices.kinds.${notice.kind}`, notice.params)}
                  </span>
                  <span className="block text-xs text-muted">
                    {formatMoment(notice.createdAt, locale)}
                  </span>
                </NoticeLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
