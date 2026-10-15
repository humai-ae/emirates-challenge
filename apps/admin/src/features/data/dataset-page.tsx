import type { ApiClient, DatasetDetail } from "@hrcc/shared";
import { Card, cx, PageHeader } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ColumnRolesForm } from "./column-roles-form";
import { DatasetIssues } from "./dataset-issues";
import { DatasetStatusTags } from "./dataset-status-tags";
import { DATASETS_QUERY_KEY, datasetQueryKey } from "./datasets-query";
import { DeleteDatasetDialog } from "./delete-dataset-dialog";
import { formatCount, formatMoment, formatPeriod, formatSize } from "./format";

const BANNER_TONES = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  high: "bg-high-bg text-high",
  neutral: "bg-soft text-muted",
} as const;

function StatusBanner({ dataset }: { dataset: DatasetDetail }) {
  const { t } = useTranslation("admin");
  const [tone, text, role] =
    dataset.status === "deleted"
      ? (["neutral", t("dataset.banner.deleted"), "status"] as const)
      : dataset.status === "rejected"
        ? ([
            "high",
            t(`dataset.banner.${dataset.rejection ?? "no_transaction_id"}`),
            "alert",
          ] as const)
        : dataset.columnsConfirmed
          ? (["ok", t("dataset.banner.confirmed"), "status"] as const)
          : (["warn", t("dataset.banner.check"), "status"] as const);
  return (
    <div
      role={role}
      className={cx("mb-4 rounded-[10px] px-3.5 py-2.5 text-sm", BANNER_TONES[tone])}
    >
      {text}
    </div>
  );
}

export function DatasetPage({ api, datasetId }: { api: ApiClient; datasetId: string }) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: datasetQueryKey(datasetId),
    queryFn: () => api.getDataset(datasetId),
  });
  // Show the dataset the API just returned, and refresh the list behind it.
  const show = (dataset: DatasetDetail) => {
    queryClient.setQueryData(datasetQueryKey(datasetId), { dataset });
    void queryClient.invalidateQueries({ queryKey: DATASETS_QUERY_KEY, exact: true });
  };

  if (query.isPending) return <p className="text-muted">{tUi("states.loading")}</p>;
  if (query.isError) return <p className="text-high">{tUi("states.error")}</p>;
  const { dataset } = query.data;
  const summary = [
    ["transactions", formatCount(dataset.transactionCount, locale)],
    ["employees", formatCount(dataset.employeeCount, locale)],
    ["period", formatPeriod(dataset.periodFrom, dataset.periodTo, locale)],
    ["issues", formatCount(dataset.issueCount, locale)],
  ] as const;

  return (
    <>
      <Link
        to="/data"
        className="mb-2 inline-block text-sm font-semibold text-primary hover:underline"
      >
        {t("dataset.back")}
      </Link>
      <PageHeader
        title={dataset.name}
        subtitle={t("dataset.uploaded", {
          date: formatMoment(dataset.createdAt, locale),
          name: dataset.createdBy,
        })}
        actions={
          <>
            <DatasetStatusTags dataset={dataset} />
            {dataset.status === "deleted" ? null : (
              <DeleteDatasetDialog api={api} dataset={dataset} onDeleted={show} />
            )}
          </>
        }
      />
      <StatusBanner dataset={dataset} />
      <dl className="mb-4 grid gap-4 md:grid-cols-4">
        {summary.map(([key, value]) => (
          <div key={key} className="rounded-[14px] border border-line bg-white p-4">
            <dt className="text-sm text-muted">{t(`dataset.summary.${key}`)}</dt>
            <dd className="text-xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      <Card className="mb-4">
        <h2 className="mb-3 text-lg font-bold">{t("dataset.files.title")}</h2>
        <ul className="flex flex-col gap-2">
          {dataset.files.map((file) => (
            <li
              key={file.kind}
              data-testid="dataset-file"
              className="flex flex-wrap items-baseline gap-x-3"
            >
              <span className="font-semibold">{t(`dataset.files.${file.kind}`)}</span>
              <bdi>{file.filename}</bdi>
              <span className="text-sm text-muted">{formatSize(file.sizeBytes, locale)}</span>
              <span className="font-mono text-xs text-muted" title={file.sha256}>
                {t("dataset.files.fingerprint")} <bdi>{file.sha256.slice(0, 12)}…</bdi>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="mb-4">
        <h2 className="mb-3 text-lg font-bold">{t("dataset.issues.title")}</h2>
        <DatasetIssues issues={dataset.issues} locale={locale} />
      </Card>
      {/* Remounts with fresh choices whenever the API returns a new mapping or status. */}
      <ColumnRolesForm
        key={`${dataset.status}:${dataset.columns.map((column) => column.role ?? "").join("|")}`}
        api={api}
        dataset={dataset}
        onConfirmed={show}
      />
    </>
  );
}
