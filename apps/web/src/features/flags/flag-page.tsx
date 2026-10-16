import { type ApiClient, ApiError, type FlagDetail, type FlagResponse } from "@hrcc/shared";
import { AuditLogTable, Card, cx, EmptyState, Tag } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DecisionPanel } from "./decision-panel";
import { FixCheckPanel } from "./fix-check-panel";
import { type FlagRole, NextSection, ProofSection, RuleSection, WhySection } from "./flag-sections";
import { SEVERITY_TONES, STATUS_TONES } from "./format";
import { LeadPanel } from "./lead-panel";
import { flagQueryKey, refreshAfterFlagChange } from "./queries";

/** What an action panel reports: the flag as it is now, and what to tell the reader. */
export type OnFlagChanged = (response: FlagResponse, message: string) => void;

export interface ActionPanelProps {
  api: ApiClient;
  flag: FlagDetail;
  onChanged: OnFlagChanged;
  onConflict: (message: string) => void;
}

/** One flag: why, the rule, the proof, what happens next, what the reader can do, and its history. */
export function FlagPage({
  api,
  flagId,
  reader,
}: {
  api: ApiClient;
  flagId: string;
  reader: FlagRole;
}) {
  const { t } = useTranslation("web");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const query = useQuery({
    queryKey: flagQueryKey(flagId),
    queryFn: () => api.getFlag(flagId),
    // Others act on flags too (a lead's fix, another analyst's decision): read it fresh each visit.
    staleTime: 0,
    // A flag that isn't there (or isn't the reader's to see) stays that way: no retry.
    retry: (failures, error) => !(error instanceof ApiError && error.status < 500) && failures < 1,
  });
  const onChanged: OnFlagChanged = (response, message) => {
    queryClient.setQueryData(flagQueryKey(flagId), response);
    setNotice({ tone: "ok", text: message });
    void refreshAfterFlagChange(queryClient);
  };
  const onConflict = (message: string) => {
    setNotice({ tone: "warn", text: message });
    void refreshAfterFlagChange(queryClient);
  };

  if (query.isPending) return <p className="text-muted">{tUi("states.loading")}</p>;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <EmptyState title={t("flag.notFound")} action={<BackLink reader={reader} status={null} />}>
          {t("flag.notFoundBody")}
        </EmptyState>
      );
    }
    return (
      <p role="alert" className="text-high">
        {tUi("states.error")}
      </p>
    );
  }
  const { flag } = query.data;
  const panel = { api, flag, onChanged, onConflict };
  return (
    <>
      <BackLink reader={reader} status={flag.status} />
      <header className="mt-2 mb-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Tag tone={SEVERITY_TONES[flag.severity]}>{t(`flags.severity.${flag.severity}`)}</Tag>
          <Tag tone={flag.kind === "rule_break" ? "neutral" : "ai"}>
            {t(`flags.kind.${flag.kind}`)}
          </Tag>
          <Tag tone={STATUS_TONES[flag.status]}>{t(`flags.status.${flag.status}`)}</Tag>
          {flag.overdue ? <Tag tone="high">{t("flags.overdue")}</Tag> : null}
        </div>
        <h1 className="text-2xl font-bold leading-tight">
          <bdi>{flag.ruleId}</bdi> · <bdi>{flag.ruleTitle}</bdi>
        </h1>
        <p className="mt-1 text-sm text-muted">
          {t("flags.transaction")}{" "}
          <bdi className="font-mono">{flag.transactionIds.join(", ") || "—"}</bdi> ·{" "}
          <bdi className="font-mono">{flag.id}</bdi> · {t("flag.foundIn")}{" "}
          <bdi className="font-mono">{flag.runId}</bdi>
        </p>
      </header>
      {flag.sentBack ? (
        <p className="mb-4 rounded-[10px] border border-high bg-high-bg px-4 py-3 text-high">
          {t("flags.sentBack", { by: flag.sentBack.by, reason: flag.sentBack.reason })}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className={cx(
            "mb-4 rounded-[10px] border px-4 py-3",
            notice.tone === "ok"
              ? "border-ok bg-ok-bg text-ok"
              : "border-warn bg-warn-bg text-warn",
          )}
        >
          {notice.text}
        </p>
      ) : null}
      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-4">
          <WhySection flag={flag} locale={locale} />
          <RuleSection flag={flag} locale={locale} />
          <ProofSection flag={flag} reader={reader} />
        </div>
        <div className="flex flex-col gap-4">
          <ActionPanel reader={reader} {...panel} />
          <NextSection flag={flag} locale={locale} />
        </div>
      </div>
      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-bold">{t("flag.history")}</h2>
        <AuditLogTable events={flag.timeline} locale={locale} />
      </Card>
    </>
  );
}

function ActionPanel({ reader, ...panel }: ActionPanelProps & { reader: FlagRole }) {
  const { t } = useTranslation("web");
  const { flag } = panel;
  if (reader === "lead") return <LeadPanel {...panel} />;
  if (reader === "analyst" && flag.allowed.includes("confirm")) return <DecisionPanel {...panel} />;
  if (reader === "analyst" && flag.allowed.includes("verify")) return <FixCheckPanel {...panel} />;
  const ownFix = reader === "analyst" && flag.status === "fix_submitted";
  return (
    <Card data-testid="flag-no-action">
      <p>
        {ownFix
          ? t("flag.ownFix")
          : t("flag.nothingToDo", { status: t(`flags.status.${flag.status}`) })}
      </p>
    </Card>
  );
}

function BackLink({ reader, status }: { reader: FlagRole; status: FlagDetail["status"] | null }) {
  const { t } = useTranslation("web");
  const className = "text-sm font-semibold text-primary hover:underline";
  const arrow = (
    <span aria-hidden="true" className="inline-block rtl:-scale-x-100">
      ←
    </span>
  );
  if (reader === "lead") {
    return (
      <Link to="/lead/queue" className={className}>
        {arrow} {t("flag.back.queue")}
      </Link>
    );
  }
  if (status === "fix_submitted") {
    return (
      <Link to="/analyst/fix-checks" className={className}>
        {arrow} {t("flag.back.fixChecks")}
      </Link>
    );
  }
  return (
    <Link to="/analyst/inbox" className={className}>
      {arrow} {t("flag.back.inbox")}
    </Link>
  );
}
