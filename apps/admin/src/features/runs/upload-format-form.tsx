import { type ApiClient, type FindingFormatResponse, MAX_FORMAT_BYTES } from "@hrcc/shared";
import { Button, FileDrop } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { formatSize } from "../data/format";
import { formatErrorMessage } from "./format-error";

const FormatFileSchema = z.object({
  file: z.custom<File | null>().superRefine((file, context) => {
    if (!file) context.addIssue({ code: "custom", message: "file_required" });
    else if (!/\.csv$/i.test(file.name)) context.addIssue({ code: "custom", message: "not_csv" });
    else if (file.size > MAX_FORMAT_BYTES)
      context.addIssue({ code: "custom", message: "too_large" });
  }),
});

export function UploadFormatForm({
  api,
  onUploaded,
  onCancel,
}: {
  api: ApiClient;
  onUploaded: (response: FindingFormatResponse) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const upload = useMutation({
    mutationFn: (body: FormData) => api.uploadFindingFormat(body),
    onSuccess: onUploaded,
  });
  const form = useForm({
    defaultValues: { file: null as File | null },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: FormatFileSchema },
    onSubmit: async ({ value }) => {
      if (!value.file) return;
      const body = new FormData();
      body.set("format", value.file);
      await upload.mutateAsync(body).catch(() => undefined);
    },
  });
  // The schema's messages are keys of this form's own errors.
  const errorOf = (errors: ReadonlyArray<unknown>) => {
    const first = errors.find(Boolean) as { message?: unknown } | string | undefined;
    const message = typeof first === "string" ? first : first?.message;
    return typeof message === "string"
      ? t(`findingFormat.upload.errors.${message}`, { defaultValue: tUi("validation.invalid") })
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
              label={t("findingFormat.upload.file")}
              prompt={t("findingFormat.upload.drop")}
              hint={t("findingFormat.upload.limits")}
              accept=".csv,text/csv"
              error={errorOf(field.state.meta.errors)}
              onFiles={([file]) => field.handleChange(file ?? null)}
            />
            {field.state.value ? (
              <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-white px-3 py-2">
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
                  {t("findingFormat.upload.remove")}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </form.Field>
      {upload.isError ? (
        <p role="alert" className="text-high">
          {formatErrorMessage(upload.error, t, tUi)}
        </p>
      ) : null}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {t(isSubmitting ? "findingFormat.upload.uploading" : "findingFormat.upload.submit")}
            </Button>
            {onCancel ? (
              <Button onClick={onCancel} disabled={isSubmitting}>
                {t("findingFormat.upload.cancel")}
              </Button>
            ) : null}
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}
