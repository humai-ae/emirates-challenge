import type { ApiClient, PolicyUploadResponse, Rule } from "@hrcc/shared";
import { Button, Card, EmptyState, PageHeader } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCount } from "../data/format";
import { liveVersion, openVersion } from "./rule-status";
import { RuleStatusTags } from "./rule-status-tags";
import { RULES_QUERY_KEY, ruleQueryKey } from "./rules-query";
import { UploadPolicyForm } from "./upload-policy-form";
import { WriteRuleForm } from "./write-rule-form";

const COLUMNS = ["id", "title", "status", "check", "severity"] as const;
const CELL = "border-b border-line px-2.5 py-2";

/** The version a row describes: the open draft, else the live version, else the newest. */
function described(rule: Rule) {
  return openVersion(rule) ?? liveVersion(rule) ?? rule.versions[0];
}

function UploadResult({ upload }: { upload: PolicyUploadResponse["upload"] }) {
  const { t } = useTranslation("admin");
  const { locale } = useLocaleSwitch();
  const count = (value: number) => formatCount(value, locale);
  return (
    <div role="status" className="mb-4 rounded-[10px] bg-ok-bg px-3.5 py-2.5 text-sm text-ok">
      <p>
        {t("rules.uploadForm.result", {
          found: count(upload.rulesFound),
          created: count(upload.created.length),
          changed: count(upload.changed.length),
          unchanged: count(upload.unchanged.length),
        })}{" "}
        {t(upload.drafting ? "rules.uploadForm.withAi" : "rules.uploadForm.withoutAi")}
      </p>
      {upload.ownerTable.length > 0 ? (
        <p className="mt-1">
          {t("rules.uploadForm.ownerTable", { count: upload.ownerTable.length })}{" "}
          <Link to="/teams" className="font-semibold underline">
            {t("rules.uploadForm.ownerTableAction")}
          </Link>
        </p>
      ) : null}
      {upload.warnings.length > 0 ? (
        <ul className="mt-1 list-disc ps-5 text-warn">
          {upload.warnings.map((warning) => (
            <li key={`${warning.code}:${warning.id ?? ""}:${warning.renamedTo ?? ""}`}>
              {t(`rules.uploadForm.warnings.${warning.code}`, {
                id: warning.id,
                renamedTo: warning.renamedTo,
              })}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function RulesPage({ api, onCreated }: { api: ApiClient; onCreated: (rule: Rule) => void }) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<"upload" | "write" | null>(null);
  const [result, setResult] = useState<PolicyUploadResponse["upload"] | null>(null);
  const rules = useQuery({
    queryKey: RULES_QUERY_KEY,
    queryFn: () => api.listRules(),
    // Drafts arrive in the background: look again until every one has.
    refetchInterval: (current) =>
      current.state.data?.rules.some((rule) =>
        rule.versions.some((version) => version.status === "drafting"),
      )
        ? 2_000
        : false,
  });
  const dataset = rules.data?.dataset ?? null;
  const list = rules.data?.rules ?? [];
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: RULES_QUERY_KEY, exact: true });
  const open = (next: "upload" | "write") => {
    setResult(null);
    setPanel(next);
  };

  return (
    <>
      <PageHeader
        title={t("rules.title")}
        subtitle={t("rules.subtitle")}
        actions={
          panel || !dataset ? null : (
            <>
              <Button variant="primary" onClick={() => open("upload")}>
                {t("rules.upload")}
              </Button>
              <Button onClick={() => open("write")}>{t("rules.write")}</Button>
            </>
          )
        }
      />
      {rules.isPending ? <p className="text-muted">{tUi("states.loading")}</p> : null}
      {rules.isError ? <p className="text-high">{tUi("states.error")}</p> : null}
      {rules.data && !dataset ? (
        <EmptyState
          title={t("rules.noData.title")}
          action={
            <Link to="/data" className="font-semibold text-primary hover:underline">
              {t("rules.noData.action")}
            </Link>
          }
        >
          {t("rules.noData.body")}
        </EmptyState>
      ) : null}
      {dataset ? (
        <p className="mb-4 text-sm text-muted">
          {t("rules.matchedTo", {
            name: dataset.name,
            total: formatCount(dataset.transactionCount, locale),
          })}
        </p>
      ) : null}
      {rules.data?.drafting ? (
        <p role="status" className="mb-4 rounded-[10px] bg-ai-bg px-3.5 py-2.5 text-sm text-ai">
          {t("rules.draftingProgress", {
            done: formatCount(rules.data.drafting.done, locale),
            total: formatCount(rules.data.drafting.total, locale),
          })}
        </p>
      ) : null}
      {panel === "upload" ? (
        <Card className="mb-4">
          <h2 className="mb-3 text-lg font-bold">{t("rules.uploadForm.title")}</h2>
          <UploadPolicyForm
            api={api}
            onCancel={() => setPanel(null)}
            onUploaded={(upload) => {
              setPanel(null);
              setResult(upload);
              refresh();
            }}
          />
        </Card>
      ) : null}
      {panel === "write" ? (
        <Card className="mb-4">
          <h2 className="mb-3 text-lg font-bold">{t("rules.writeForm.title")}</h2>
          <WriteRuleForm
            api={api}
            onCancel={() => setPanel(null)}
            onCreated={(response) => {
              queryClient.setQueryData(ruleQueryKey(response.rule.id), response);
              refresh();
              onCreated(response.rule);
            }}
          />
        </Card>
      ) : null}
      {result ? <UploadResult upload={result} /> : null}
      {dataset && list.length === 0 && !panel ? (
        <EmptyState title={t("rules.empty.title")}>{t("rules.empty.body")}</EmptyState>
      ) : null}
      {list.length > 0 ? (
        <Card>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th
                    key={column}
                    className={`${CELL} text-start text-sm font-semibold text-muted`}
                  >
                    {t(`rules.columns.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((rule) => {
                const version = described(rule);
                return (
                  <tr key={rule.id} data-testid="rule-row" className="align-top">
                    <td className={`${CELL} font-mono text-sm`}>
                      <bdi>{rule.id}</bdi>
                    </td>
                    <td className={`${CELL} font-semibold`}>
                      <Link
                        to="/rules/$ruleId"
                        params={{ ruleId: rule.id }}
                        className="text-primary hover:underline"
                      >
                        <bdi>{rule.title}</bdi>
                      </Link>
                      {rule.requestedBy ? (
                        <p className="text-sm font-normal text-muted">
                          {t("rules.requestedBy", { name: rule.requestedBy })}
                        </p>
                      ) : null}
                    </td>
                    <td className={CELL}>
                      <RuleStatusTags rule={rule} />
                    </td>
                    <td className={`${CELL} text-sm`}>
                      {version?.preset ? t(`rules.presets.${version.preset}`) : "—"}
                    </td>
                    <td className={`${CELL} text-sm`}>
                      {version ? t(`rules.severity.${version.severity}`) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : null}
    </>
  );
}
