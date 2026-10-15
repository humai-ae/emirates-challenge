import type { ApiClient, DatasetDetail } from "@hrcc/shared";
import { apiErrorMessage, Button } from "@hrcc/ui";
import { useMutation } from "@tanstack/react-query";
import { AlertDialog } from "radix-ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function DeleteDatasetDialog({
  api,
  dataset,
  onDeleted,
}: {
  api: ApiClient;
  dataset: DatasetDetail;
  onDeleted: (dataset: DatasetDetail) => void;
}) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.deleteDataset(dataset.id),
    onSuccess: ({ dataset: updated }) => {
      setOpen(false);
      onDeleted(updated);
    },
  });
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) remove.reset();
      }}
    >
      <AlertDialog.Trigger asChild>
        <Button variant="danger">{t("dataset.delete.button")}</Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-ink/40" />
        <AlertDialog.Content className="fixed inset-0 m-auto h-fit w-[min(92vw,28rem)] rounded-[14px] bg-white p-6 shadow-lg">
          <AlertDialog.Title className="mb-2 text-lg font-bold">
            {t("dataset.delete.title", { name: dataset.name })}
          </AlertDialog.Title>
          <AlertDialog.Description className="mb-4 text-muted">
            {t("dataset.delete.body")}
          </AlertDialog.Description>
          {remove.isError ? (
            <p role="alert" className="mb-3 text-high">
              {apiErrorMessage(remove.error, tUi)}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button>{t("dataset.delete.cancel")}</Button>
            </AlertDialog.Cancel>
            {/* Not AlertDialog.Action: that closes the dialog before the result is known. */}
            <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {t("dataset.delete.confirm")}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
