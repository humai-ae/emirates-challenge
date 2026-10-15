import type { DatasetStatus, DatasetSummary } from "@hrcc/shared";
import { Tag, type TagTone } from "@hrcc/ui";
import { useTranslation } from "react-i18next";

const TONES: Record<DatasetStatus, TagTone> = { ready: "ok", rejected: "high", deleted: "neutral" };

export function DatasetStatusTags({
  dataset,
}: {
  dataset: Pick<DatasetSummary, "status" | "columnsConfirmed">;
}) {
  const { t } = useTranslation("admin");
  return (
    <div className="flex flex-wrap gap-1">
      <Tag tone={TONES[dataset.status]}>{t(`data.status.${dataset.status}`)}</Tag>
      {dataset.status !== "deleted" && !dataset.columnsConfirmed ? (
        <Tag tone="warn">{t("data.status.checkColumns")}</Tag>
      ) : null}
    </div>
  );
}
