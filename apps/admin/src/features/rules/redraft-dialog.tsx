import type { ApiClient, Rule, RuleResponse } from "@hrcc/shared";
import { apiErrorMessage, Button } from "@hrcc/ui";
import { useMutation } from "@tanstack/react-query";
import { AlertDialog } from "radix-ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/** Drafting the open version again replaces its check type and values, so it asks first. */
export function RedraftDialog({
  api,
  rule,
  onDone,
}: {
  api: ApiClient;
  rule: Rule;
  onDone: (response: RuleResponse) => void;
}) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const [open, setOpen] = useState(false);
  const redraft = useMutation({
    mutationFn: () => api.redraftRule(rule.id, { rowVersion: rule.rowVersion }),
    onSuccess: (response) => {
      setOpen(false);
      onDone(response);
    },
  });
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) redraft.reset();
      }}
    >
      <AlertDialog.Trigger asChild>
        <Button>{t("rules.redraftDialog.button")}</Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-ink/40" />
        <AlertDialog.Content className="fixed inset-0 m-auto h-fit w-[min(92vw,28rem)] rounded-[14px] bg-white p-6 shadow-lg">
          <AlertDialog.Title className="mb-2 text-lg font-bold">
            {t("rules.redraftDialog.title", { id: rule.id })}
          </AlertDialog.Title>
          <AlertDialog.Description className="mb-4 text-muted">
            {t("rules.redraftDialog.body")}
          </AlertDialog.Description>
          {redraft.isError ? (
            <p role="alert" className="mb-3 text-high">
              {apiErrorMessage(redraft.error, tUi)}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button>{t("rules.redraftDialog.cancel")}</Button>
            </AlertDialog.Cancel>
            <Button variant="primary" disabled={redraft.isPending} onClick={() => redraft.mutate()}>
              {t("rules.redraftDialog.confirm")}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
