import { type ApiClient, CreateRuleRequestSchema, type RuleResponse } from "@hrcc/shared";
import { apiErrorMessage, Button, cx, fieldError } from "@hrcc/ui";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useId } from "react";
import { useTranslation } from "react-i18next";

export function WriteRuleForm({
  api,
  onCreated,
  onCancel,
}: {
  api: ApiClient;
  onCreated: (response: RuleResponse) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const id = useId();
  const create = useMutation({
    mutationFn: (text: string) => api.createRule({ text }),
    onSuccess: onCreated,
  });
  const form = useForm({
    defaultValues: { text: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: CreateRuleRequestSchema },
    onSubmit: async ({ value }) => {
      await create.mutateAsync(value.text.trim()).catch(() => undefined);
    },
  });
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="text">
        {(field) => {
          const error = fieldError(field.state.meta.errors, tUi);
          return (
            <div className="flex flex-col gap-1">
              <label htmlFor={id} className="text-sm font-semibold">
                {t("rules.writeForm.text")}
              </label>
              <textarea
                id={id}
                rows={4}
                dir="auto"
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-hint ${id}-error` : `${id}-hint`}
                className={cx(
                  "rounded-[10px] border bg-white px-3 py-2",
                  error ? "border-high" : "border-control",
                )}
              />
              <p id={`${id}-hint`} className="text-sm text-muted">
                {t("rules.writeForm.hint")}
              </p>
              {error ? (
                <p id={`${id}-error`} className="text-sm text-high">
                  {error}
                </p>
              ) : null}
            </div>
          );
        }}
      </form.Field>
      {create.isError ? (
        <p role="alert" className="text-high">
          {apiErrorMessage(create.error, tUi)}
        </p>
      ) : null}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {t("rules.writeForm.submit")}
            </Button>
            <Button onClick={onCancel} disabled={isSubmitting}>
              {t("rules.writeForm.cancel")}
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}
