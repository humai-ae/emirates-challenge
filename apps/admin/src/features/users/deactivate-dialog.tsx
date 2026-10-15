import type { ApiClient, ManagedUser } from "@hrcc/shared";
import { apiErrorMessage, Button } from "@hrcc/ui";
import { useMutation } from "@tanstack/react-query";
import { AlertDialog } from "radix-ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function DeactivateDialog({
  api,
  user,
  onDone,
}: {
  api: ApiClient;
  user: ManagedUser;
  onDone: () => void;
}) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const [open, setOpen] = useState(false);
  const deactivate = useMutation({
    mutationFn: () => api.deactivateUser(user.id),
    onSuccess: () => {
      setOpen(false);
      onDone();
    },
  });
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) deactivate.reset();
      }}
    >
      <AlertDialog.Trigger asChild>
        <Button variant="danger">{t("users.deactivate")}</Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-ink/40" />
        <AlertDialog.Content className="fixed inset-0 m-auto h-fit w-[min(92vw,28rem)] rounded-[14px] bg-white p-6 shadow-lg">
          <AlertDialog.Title className="mb-2 text-lg font-bold">
            {t("users.deactivateDialog.title", { name: user.displayName })}
          </AlertDialog.Title>
          <AlertDialog.Description className="mb-4 text-muted">
            {t("users.deactivateDialog.body")}
          </AlertDialog.Description>
          {deactivate.isError ? (
            <p role="alert" className="mb-3 text-high">
              {apiErrorMessage(deactivate.error, tUi)}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button>{t("users.deactivateDialog.cancel")}</Button>
            </AlertDialog.Cancel>
            {/* Not AlertDialog.Action: that closes the dialog before the result is known. */}
            <Button
              variant="danger"
              disabled={deactivate.isPending}
              onClick={() => deactivate.mutate()}
            >
              {t("users.deactivateDialog.confirm")}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
