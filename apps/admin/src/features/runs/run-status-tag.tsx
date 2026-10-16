import type { RunStatus } from "@hrcc/shared";
import { Tag, type TagTone } from "@hrcc/ui";
import { useTranslation } from "react-i18next";

const TONES: Record<RunStatus, TagTone> = { complete: "ok", complete_with_errors: "warn" };

export function RunStatusTag({ status }: { status: RunStatus }) {
  const { t } = useTranslation("admin");
  return <Tag tone={TONES[status]}>{t(`runs.status.${status}`)}</Tag>;
}
