import type { ApiClient, FindingFormatResponse } from "@hrcc/shared";
import { Button, Card, PageHeader, Tag } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoment } from "../data/format";
import { MappingForm } from "./mapping-form";
import { FINDING_FORMAT_QUERY_KEY, RUNS_QUERY_KEY } from "./runs-query";
import { UploadFormatForm } from "./upload-format-form";

export function FindingFormatPage({ api }: { api: ApiClient }) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const queryClient = useQueryClient();
  const [replacing, setReplacing] = useState(false);
  const current = useQuery({
    queryKey: FINDING_FORMAT_QUERY_KEY,
    queryFn: () => api.getFindingFormat(),
  });
  // A new or confirmed format changes what runs can export.
  const show = (response: FindingFormatResponse) => {
    queryClient.setQueryData(FINDING_FORMAT_QUERY_KEY, response);
    void queryClient.invalidateQueries({ queryKey: RUNS_QUERY_KEY });
    setReplacing(false);
  };
  const format = current.data?.format ?? null;

  return (
    <>
      <PageHeader title={t("findingFormat.title")} subtitle={t("findingFormat.subtitle")} />
      {current.isPending ? <p className="text-muted">{tUi("states.loading")}</p> : null}
      {current.isError ? <p className="text-high">{tUi("states.error")}</p> : null}
      {current.data && (!format || replacing) ? (
        <Card className="mb-4">
          <h2 className="mb-3 text-lg font-bold">{t("findingFormat.upload.title")}</h2>
          <UploadFormatForm
            api={api}
            onUploaded={show}
            onCancel={format ? () => setReplacing(false) : undefined}
          />
        </Card>
      ) : null}
      {format ? (
        <Card>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{t("findingFormat.current.title")}</h2>
              <p className="text-sm text-muted">
                {t("findingFormat.current.uploaded", {
                  filename: format.filename,
                  date: formatMoment(format.uploadedAt, locale),
                  name: format.uploadedBy,
                })}
              </p>
              <p className="text-sm text-muted">
                {format.confirmedAt && format.confirmedBy
                  ? t("findingFormat.current.confirmed", {
                      date: formatMoment(format.confirmedAt, locale),
                      name: format.confirmedBy,
                    })
                  : t("findingFormat.current.unconfirmed")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone={format.confirmedAt ? "ok" : "warn"}>
                {t(
                  format.confirmedAt
                    ? "findingFormat.status.confirmed"
                    : "findingFormat.status.unconfirmed",
                )}
              </Tag>
              {replacing ? null : (
                <Button onClick={() => setReplacing(true)}>
                  {t("findingFormat.current.replace")}
                </Button>
              )}
            </div>
          </div>
          {/* Remounts with the saved mapping after every change. */}
          <MappingForm
            key={`${format.id}:${format.rowVersion}`}
            api={api}
            format={format}
            onConfirmed={show}
          />
        </Card>
      ) : null}
    </>
  );
}
