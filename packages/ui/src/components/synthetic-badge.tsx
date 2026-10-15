import { useTranslation } from "react-i18next";

export function SyntheticBadge() {
  const { t } = useTranslation("ui");
  return (
    <span
      data-testid="synthetic-banner"
      className="rounded-full bg-synthetic px-2.5 py-0.5 text-xs font-semibold text-synthetic-ink"
    >
      {t("syntheticData")}
    </span>
  );
}
