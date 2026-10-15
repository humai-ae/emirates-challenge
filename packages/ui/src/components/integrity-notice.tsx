import type { IntegrityResult } from "@hrcc/shared";
import { useTranslation } from "react-i18next";

export function IntegrityNotice({ result }: { result: IntegrityResult }) {
  const { t } = useTranslation("ui");
  if (result.ok) {
    return (
      <output className="block rounded-[10px] bg-ok-bg px-3.5 py-2.5 text-sm text-ok">
        {t("audit.integrityOk", { count: result.count })}
      </output>
    );
  }
  return (
    <div role="alert" className="rounded-[10px] bg-high-bg px-3.5 py-2.5 text-sm text-high">
      {t("audit.integrityBroken", { eventId: result.brokenAt })}
    </div>
  );
}
