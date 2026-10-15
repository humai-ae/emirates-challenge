import type { ApiClient, DatasetDetail } from "@hrcc/shared";
import { Button, Card, EmptyState, PageHeader } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DatasetStatusTags } from "./dataset-status-tags";
import { DATASETS_QUERY_KEY, datasetQueryKey } from "./datasets-query";
import { formatCount, formatMoment, formatPeriod } from "./format";
import { UploadDatasetForm } from "./upload-dataset-form";

const COLUMNS = [
  "name",
  "status",
  "transactions",
  "employees",
  "period",
  "issues",
  "uploaded",
] as const;
const CELL = "border-b border-line px-2.5 py-2";

export function DataPage({
  api,
  onUploaded,
}: {
  api: ApiClient;
  onUploaded: (dataset: DatasetDetail) => void;
}) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const datasets = useQuery({ queryKey: DATASETS_QUERY_KEY, queryFn: () => api.listDatasets() });
  const all = datasets.data?.datasets ?? [];
  // Deleted datasets keep their record; they wait behind a toggle so usable data stays in front.
  const list = all.filter((dataset) => dataset.status !== "deleted");
  const deleted = all.filter((dataset) => dataset.status === "deleted");

  return (
    <>
      <PageHeader
        title={t("data.title")}
        subtitle={t("data.subtitle")}
        actions={
          adding ? null : (
            <Button variant="primary" onClick={() => setAdding(true)}>
              {t("data.upload")}
            </Button>
          )
        }
      />
      {adding ? (
        <Card className="mb-4">
          <h2 className="mb-3 text-lg font-bold">{t("data.form.title")}</h2>
          <UploadDatasetForm
            api={api}
            previous={list}
            onCancel={() => setAdding(false)}
            onUploaded={(dataset) => {
              queryClient.setQueryData(datasetQueryKey(dataset.id), { dataset });
              void queryClient.invalidateQueries({ queryKey: DATASETS_QUERY_KEY, exact: true });
              onUploaded(dataset);
            }}
          />
        </Card>
      ) : null}
      {datasets.isPending ? <p className="text-muted">{tUi("states.loading")}</p> : null}
      {datasets.isError ? <p className="text-high">{tUi("states.error")}</p> : null}
      {datasets.data && list.length === 0 && !adding ? (
        <EmptyState title={t("data.empty.title")}>{t("data.empty.body")}</EmptyState>
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
                    {t(`data.columns.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((dataset) => (
                <tr key={dataset.id} data-testid="dataset-row" className="align-top">
                  <td className={`${CELL} font-semibold`}>
                    <Link
                      to="/data/$datasetId"
                      params={{ datasetId: dataset.id }}
                      className="text-primary hover:underline"
                    >
                      <bdi>{dataset.name}</bdi>
                    </Link>
                  </td>
                  <td className={CELL}>
                    <DatasetStatusTags dataset={dataset} />
                  </td>
                  <td className={CELL}>{formatCount(dataset.transactionCount, locale)}</td>
                  <td className={CELL}>{formatCount(dataset.employeeCount, locale)}</td>
                  <td className={`${CELL} text-sm`}>
                    {formatPeriod(dataset.periodFrom, dataset.periodTo, locale)}
                  </td>
                  <td className={CELL}>{formatCount(dataset.issueCount, locale)}</td>
                  <td className={`${CELL} text-sm`}>
                    <time dateTime={dataset.createdAt}>
                      {formatMoment(dataset.createdAt, locale)}
                    </time>
                    <div className="text-muted">
                      <bdi>{dataset.createdBy}</bdi>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
      {deleted.length > 0 ? (
        <div className="mt-4">
          <button
            type="button"
            aria-expanded={showDeleted}
            className="text-sm font-semibold text-muted hover:text-ink"
            onClick={() => setShowDeleted((open) => !open)}
          >
            {t("data.deleted", { total: deleted.length })}
          </button>
          {showDeleted ? (
            <ul className="mt-2 flex flex-col gap-2">
              {deleted.map((dataset) => (
                <li
                  key={dataset.id}
                  data-testid="deleted-dataset-row"
                  className="flex flex-wrap items-baseline gap-x-3 text-sm text-muted"
                >
                  <Link
                    to="/data/$datasetId"
                    params={{ datasetId: dataset.id }}
                    className="font-semibold text-primary hover:underline"
                  >
                    <bdi>{dataset.name}</bdi>
                  </Link>
                  <time dateTime={dataset.createdAt}>
                    {formatMoment(dataset.createdAt, locale)}
                  </time>
                  <bdi>{dataset.createdBy}</bdi>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
