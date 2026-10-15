import { type Locale, LocaleSchema } from "@hrcc/shared";
import { ToggleGroup } from "radix-ui";
import { useTranslation } from "react-i18next";

const ITEM =
  "px-3 py-1 text-sm text-white data-[state=on]:bg-white data-[state=on]:font-semibold data-[state=on]:text-brand";

export function LanguageSwitch({
  value,
  onChange,
}: {
  value: Locale;
  onChange: (locale: Locale) => void;
}) {
  const { t } = useTranslation("ui");
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      aria-label={t("language.label")}
      className="inline-flex overflow-hidden rounded-lg border border-white/40"
      onValueChange={(next) => {
        // Clicking the active item reports "" — ignore it.
        const parsed = LocaleSchema.safeParse(next);
        if (parsed.success && parsed.data !== value) onChange(parsed.data);
      }}
    >
      <ToggleGroup.Item value="en" lang="en" className={ITEM}>
        {t("language.en")}
      </ToggleGroup.Item>
      <ToggleGroup.Item value="ar" lang="ar" className={ITEM}>
        {t("language.ar")}
      </ToggleGroup.Item>
    </ToggleGroup.Root>
  );
}
