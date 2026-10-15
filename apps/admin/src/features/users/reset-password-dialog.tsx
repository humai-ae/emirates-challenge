import {
  type ApiClient,
  type ManagedUser,
  type ResetPasswordRequest,
  ResetPasswordRequestSchema,
} from "@hrcc/shared";
import { apiErrorMessage, Button, fieldError, TextField } from "@hrcc/ui";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function ResetPasswordDialog({
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
  const reset = useMutation({
    mutationFn: (input: ResetPasswordRequest) => api.resetUserPassword(user.id, input),
    onSuccess: () => {
      setOpen(false);
      onDone();
    },
  });
  const form = useForm({
    defaultValues: { password: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: ResetPasswordRequestSchema },
    onSubmit: async ({ value }) => {
      await reset.mutateAsync(value).catch(() => undefined);
    },
  });
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          form.reset();
          reset.reset();
        }
      }}
    >
      <Dialog.Trigger asChild>
        <Button>{t("users.resetPassword")}</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/40" />
        <Dialog.Content className="fixed inset-0 m-auto h-fit w-[min(92vw,28rem)] rounded-[14px] bg-white p-6 shadow-lg">
          <Dialog.Title className="mb-2 text-lg font-bold">
            {t("users.resetDialog.title", { name: user.displayName })}
          </Dialog.Title>
          <Dialog.Description className="mb-4 text-muted">
            {t("users.resetDialog.body")}
          </Dialog.Description>
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <form.Field name="password">
              {(field) => (
                <TextField
                  label={t("users.resetDialog.password")}
                  autoComplete="off"
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  error={fieldError(field.state.meta.errors, tUi)}
                />
              )}
            </form.Field>
            {reset.isError ? (
              <p role="alert" className="text-high">
                {apiErrorMessage(reset.error, tUi)}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button>{t("users.resetDialog.cancel")}</Button>
              </Dialog.Close>
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Button type="submit" variant="primary" disabled={isSubmitting}>
                    {t("users.resetDialog.submit")}
                  </Button>
                )}
              </form.Subscribe>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
