import type { AuditAction, AuditEvent, Locale } from "@hrcc/shared";
import { useTranslation } from "react-i18next";

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** `auth.sign_in` → `audit.actions.auth_sign_in` (i18next treats dots as nesting). */
export function auditActionKey(action: AuditAction): string {
  return `audit.actions.${action.replace(".", "_")}`;
}

function describe(event: AuditEvent, t: Translate): string {
  const after = (event.after ?? {}) as Record<string, unknown>;
  const locale = typeof after.locale === "string" ? t(`language.${after.locale}`) : "";
  return t(auditActionKey(event.action), { locale });
}

const COLUMNS = ["when", "who", "what", "object"] as const;

export function AuditLogTable({ events, locale }: { events: AuditEvent[]; locale: Locale }) {
  const { t } = useTranslation("ui");
  if (events.length === 0) return <p className="text-muted">{t("audit.empty")}</p>;
  const format = new Intl.DateTimeFormat(locale === "ar" ? "ar-AE-u-nu-latn" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Dubai",
  });
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          {COLUMNS.map((column) => (
            <th
              key={column}
              className="border-b border-line px-2.5 py-2 text-start text-sm font-semibold text-muted"
            >
              {t(`audit.columns.${column}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {events.map((event) => (
          <tr key={event.eventId} data-testid="audit-row" className="align-top">
            <td className="border-b border-line px-2.5 py-2 text-sm text-muted">
              <time dateTime={event.at}>{format.format(new Date(event.at))}</time>
            </td>
            <td className="border-b border-line px-2.5 py-2 font-semibold">
              <bdi>{event.actorName}</bdi>
            </td>
            <td className="border-b border-line px-2.5 py-2">
              {describe(event, t)}
              {event.reason ? (
                <div className="text-sm">{t("audit.reason", { reason: event.reason })}</div>
              ) : null}
            </td>
            <td className="border-b border-line px-2.5 py-2 font-mono text-xs">
              <bdi>
                {event.eventId} · {event.objectType}
              </bdi>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
