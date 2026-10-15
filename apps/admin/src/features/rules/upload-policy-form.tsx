import { type ApiClient, MAX_POLICY_BYTES, type PolicyUploadResponse } from "@hrcc/shared";
import { Button, FileDrop } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { formatSize } from "../data/format";
import { policyErrorMessage } from "./policy-error";

const PolicyFormSchema = z.object({
  file: z.custom<File | null>().superRefine((file, context) => {
    if (!file) context.addIssue({ code: "custom", message: "file_required" });
    else if (!/\.(md|markdown|txt)$/i.test(file.name)) {
      context.addIssue({ code: "custom", message: "not_policy" });
    } else if (file.size > MAX_POLICY_BYTES) {
      context.addIssue({ code: "custom", message: "too_large" });
    }
  }),
});

export function UploadPolicyForm({
  api,
  onUploaded,
  onCancel,
}: {
  api: ApiClient;
  onUploaded: (upload: PolicyUploadResponse["upload"]) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const upload = useMutation({
    mutationFn: (body: FormData) => api.uploadPolicy(body),
    onSuccess: (response) => onUploaded(response.upload),
  });
  const form = useForm({
    defaultValues: { file: null as File | null },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: PolicyFormSchema },
    onSubmit: async ({ value }) => {
      if (!value.file) return;
      const body = new FormData();
      body.set("policy", value.file);
      await upload.mutateAsync(body).catch(() => undefined);
    },
  });
  // The schema's messages are keys of this form's own errors.
  const errorOf = (errors: ReadonlyArray<unknown>) => {
    const first = errors.find(Boolean) as { message?: unknown } | string | undefined;
    const message = typeof first === "string" ? first : first?.message;
    return typeof message === "string"
      ? t(`rules.uploadForm.errors.${message}`, { defaultValue: tUi("validation.invalid") })
      : undefined;
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="file">
        {(field) => (
          <div className="flex flex-col gap-2">
            <FileDrop
              label={t("rules.uploadForm.file")}
              prompt={t("rules.uploadForm.drop")}
              hint={t("rules.uploadForm.limits")}
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              error={errorOf(field.state.meta.errors)}
              onFiles={([file]) => field.handleChange(file ?? null)}
            />
            {field.state.value ? (
              <div
                data-testid="chosen-policy"
                className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-white px-3 py-2"
              >
                <span className="font-semibold">
                  <bdi>{field.state.value.name}</bdi>
                </span>
                <span className="text-sm text-muted">
                  {formatSize(field.state.value.size, locale)}
                </span>
                <button
                  type="button"
                  className="text-sm font-semibold text-primary hover:underline"
                  onClick={() => field.handleChange(null)}
                >
                  {t("rules.uploadForm.remove")}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </form.Field>
      {upload.isError ? (
        <p role="alert" className="text-high">
          {policyErrorMessage(upload.error, t, tUi)}
        </p>
      ) : null}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {t(isSubmitting ? "rules.uploadForm.uploading" : "rules.uploadForm.submit")}
            </Button>
            <Button onClick={onCancel} disabled={isSubmitting}>
              {t("rules.uploadForm.cancel")}
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}
