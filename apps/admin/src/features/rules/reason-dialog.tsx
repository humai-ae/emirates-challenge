import {
  type Rule,
  type RuleReasonRequest,
  RuleReasonRequestSchema,
  type RuleResponse,
} from "@hrcc/shared";
import { apiErrorMessage, Button, cx, fieldError } from "@hrcc/ui";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Dialog } from "radix-ui";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

const ReasonSchema = RuleReasonRequestSchema.pick({ reason: true });

/** Rejecting a draft and retiring a rule both need a reason, which stays in the history. */
export function ReasonDialog({
  kind,
  rule,
  act,
  onDone,
}: {
  kind: "reject" | "retire";
  rule: Rule;
  act: (input: RuleReasonRequest) => Promise<RuleResponse>;
  onDone: (response: RuleResponse) => void;
}) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const id = useId();
  const [open, setOpen] = useState(false);
  const strings = kind === "reject" ? "rules.rejectDialog" : "rules.retireDialog";
  const decide = useMutation({
    mutationFn: (reason: string) => act({ rowVersion: rule.rowVersion, reason }),
    onSuccess: (response) => {
      setOpen(false);
      onDone(response);
    },
  });
  const form = useForm({
    defaultValues: { reason: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: ReasonSchema },
    onSubmit: async ({ value }) => {
      await decide.mutateAsync(value.reason.trim()).catch(() => undefined);
    },
  });
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          form.reset();
          decide.reset();
        }
      }}
    >
      <Dialog.Trigger asChild>
        <Button variant="danger">{t(`${strings}.button`)}</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/40" />
        <Dialog.Content className="fixed inset-0 m-auto h-fit w-[min(92vw,28rem)] rounded-[14px] bg-white p-6 shadow-lg">
          <Dialog.Title className="mb-2 text-lg font-bold">
            {t(`${strings}.title`, { id: rule.id })}
          </Dialog.Title>
          <Dialog.Description className="mb-4 text-muted">
            {t(`${strings}.body`)}
          </Dialog.Description>
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <form.Field name="reason">
              {(field) => {
                const error = fieldError(field.state.meta.errors, tUi);
                return (
                  <div className="flex flex-col gap-1">
                    <label htmlFor={id} className="text-sm font-semibold">
                      {t(`${strings}.reason`)}
                    </label>
                    <textarea
                      id={id}
                      rows={3}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `${id}-error` : undefined}
                      className={cx(
                        "rounded-[10px] border bg-white px-3 py-2",
                        error ? "border-high" : "border-control",
                      )}
                    />
                    {error ? (
                      <p id={`${id}-error`} className="text-sm text-high">
                        {error}
                      </p>
                    ) : null}
                  </div>
                );
              }}
            </form.Field>
            {decide.isError ? (
              <p role="alert" className="text-high">
                {apiErrorMessage(decide.error, tUi)}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button>{t(`${strings}.cancel`)}</Button>
              </Dialog.Close>
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Button type="submit" variant="danger" disabled={isSubmitting}>
                    {t(`${strings}.confirm`)}
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
