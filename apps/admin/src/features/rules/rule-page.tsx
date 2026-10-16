import type { ApiClient, RuleResponse } from "@hrcc/shared";
import { Card, cx } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { formatCount } from "../data/format";
import { DraftForm } from "./draft-form";
import { RuleActions } from "./rule-actions";
import { liveVersion, openVersion } from "./rule-status";
import { RuleStatusTags } from "./rule-status-tags";
import { RULES_QUERY_KEY, ruleQueryKey } from "./rules-query";
import { VersionSummary } from "./version-summary";
import { VersionsList } from "./versions-list";

const BANNER = "mb-4 rounded-[10px] px-3.5 py-2.5 text-sm";

/** One rule beside its policy text: the open draft to review, or the version that is live. */
export function RulePage({ api, ruleId }: { api: ApiClient; ruleId: string }) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ruleQueryKey(ruleId),
    queryFn: () => api.getRule(ruleId),
    // A draft arrives in the background: look again until it has.
    refetchInterval: (current) =>
      current.state.data?.rule.versions.some((version) => version.status === "drafting")
        ? 2_000
        : false,
  });
  // Show the rule the API just returned, and refresh the list behind it.
  const show = (response: RuleResponse) => {
    queryClient.setQueryData(ruleQueryKey(ruleId), response);
    void queryClient.invalidateQueries({ queryKey: RULES_QUERY_KEY, exact: true });
  };

  if (query.isPending) return <p className="text-muted">{tUi("states.loading")}</p>;
  if (query.isError) return <p className="text-high">{tUi("states.error")}</p>;
  const { rule, dataset } = query.data;
  const open = openVersion(rule);
  const live = liveVersion(rule);
  const [newest] = rule.versions;
  const shown = open ?? live ?? newest;
  const needed = (open?.needs ?? [])
    .map((need) => t(`dataset.roles.${need.role}`, { defaultValue: need.role }))
    .join(", ");

  return (
    <>
      <Link
        to="/rules"
        className="mb-2 inline-block text-sm font-semibold text-primary hover:underline"
      >
        {t("rules.back")}
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm text-muted">
            <bdi>{rule.id}</bdi>
          </p>
          <h1 className="mb-1 text-2xl font-bold leading-tight">
            <bdi>{rule.title}</bdi>
          </h1>
          {dataset ? (
            <p className="text-muted">
              {t("rules.matchedTo", {
                name: dataset.name,
                total: formatCount(dataset.transactionCount, locale),
              })}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RuleStatusTags rule={rule} />
          <RuleActions api={api} rule={rule} onChanged={show} />
        </div>
      </div>
      {!dataset ? (
        <div role="alert" className={cx(BANNER, "bg-high-bg text-high")}>
          {t("rules.page.noData")}{" "}
          <Link to="/data" className="font-semibold underline">
            {t("rules.noData.action")}
          </Link>
        </div>
      ) : null}
      {open?.status === "drafting" ? (
        <div role="status" className={cx(BANNER, "bg-info-bg text-info")}>
          {t("rules.page.drafting")}
        </div>
      ) : open?.status === "draft_failed" ? (
        <div role="status" className={cx(BANNER, "bg-warn-bg text-warn")}>
          {t(open.draftError === "incomplete" ? "rules.page.incomplete" : "rules.page.draftFailed")}
        </div>
      ) : open?.status === "needs_data" ? (
        <div role="status" className={cx(BANNER, "bg-high-bg text-high")}>
          {t("rules.page.needsData", { fields: needed })}
        </div>
      ) : open?.draftedBy === "ai" && open.draftMeta?.ai ? (
        <div role="status" className={cx(BANNER, "bg-ai-bg text-ai")}>
          {t("rules.page.draftedByAi", {
            model: open.draftMeta.ai.model,
            confidence: formatCount(Math.round(open.draftMeta.ai.confidence * 100), locale),
            weakest:
              open.draftMeta.ai.weakest === "preset"
                ? t("rules.page.weakestPreset")
                : t(`rules.parameters.${open.draftMeta.ai.weakest}`, {
                    defaultValue: open.draftMeta.ai.weakest,
                  }),
          })}
        </div>
      ) : open?.draftedBy === "keywords" ? (
        <div role="status" className={cx(BANNER, "bg-info-bg text-info")}>
          {t(
            open.draftMeta?.aiProblem === "unavailable"
              ? "rules.page.aiUnavailable"
              : "rules.page.draftedWithoutAi",
          )}
        </div>
      ) : null}
      <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="self-start">
          <h2 className="mb-2 text-lg font-bold">{t("rules.page.policyText")}</h2>
          <blockquote dir="auto" className="whitespace-pre-line border-s-4 border-line ps-3">
            {shown?.sourceText}
          </blockquote>
        </Card>
        <div className="flex flex-col gap-4">
          {open?.status === "drafting" ? (
            <Card>
              <p className="text-muted">{t("rules.page.draftingCard")}</p>
            </Card>
          ) : open ? (
            // Remounted after every change, so the form starts from what was saved.
            <DraftForm
              key={`${open.version}:${rule.rowVersion}`}
              api={api}
              rule={rule}
              version={open}
              dataset={dataset}
              onChanged={show}
            />
          ) : shown ? (
            <VersionSummary
              api={api}
              version={shown}
              title={t(live ? "rules.page.live" : "rules.page.latest")}
            />
          ) : null}
        </div>
      </div>
      <VersionsList rule={rule} />
    </>
  );
}
