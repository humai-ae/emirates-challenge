import {
  type ApiClient,
  type DatasetDetail,
  type DatasetSummary,
  MAX_UPLOAD_BYTES,
} from "@hrcc/shared";
import { Button, FileDrop, fieldError, SelectField, TextField } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { formatSize } from "./format";
import { uploadErrorMessage } from "./upload-error";

/** A chosen file must be a .csv within the limit; whether one is needed is decided below. */
const CsvFileSchema = z.custom<File | null>().superRefine((file, context) => {
  if (!file) return;
  if (!/\.csv$/i.test(file.name)) context.addIssue({ code: "custom", message: "file_not_csv" });
  else if (file.size > MAX_UPLOAD_BYTES) {
    context.addIssue({ code: "custom", message: "file_too_large" });
  }
});

const UploadFormSchema = z
  .object({
    name: z.string().max(120, { error: "too_long" }),
    transactions: CsvFileSchema,
    employees: CsvFileSchema,
    /** An earlier dataset whose employees file to reuse; "" means upload a new one. */
    employeesFrom: z.string(),
  })
  .superRefine((value, context) => {
    if (!value.transactions) {
      context.addIssue({ code: "custom", path: ["transactions"], message: "file_required" });
    }
    if (!value.employeesFrom && !value.employees) {
      context.addIssue({ code: "custom", path: ["employees"], message: "file_required" });
    }
  });

type UploadFormValues = z.infer<typeof UploadFormSchema>;
const EMPTY: UploadFormValues = {
  name: "",
  transactions: null,
  employees: null,
  employeesFrom: "",
};

export function UploadDatasetForm({
  api,
  previous,
  onUploaded,
  onCancel,
}: {
  api: ApiClient;
  previous: readonly DatasetSummary[];
  onUploaded: (dataset: DatasetDetail) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const size = (bytes: number) => formatSize(bytes, locale);
  const upload = useMutation({
    mutationFn: (body: FormData) => api.uploadDataset(body),
    onSuccess: ({ dataset }) => onUploaded(dataset),
  });
  const form = useForm({
    defaultValues: EMPTY,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: UploadFormSchema },
    onSubmit: async ({ value }) => {
      const body = new FormData();
      if (value.name.trim()) body.set("name", value.name.trim());
      if (value.transactions) body.set("transactions", value.transactions);
      if (value.employeesFrom) body.set("employeesFromDatasetId", value.employeesFrom);
      else if (value.employees) body.set("employees", value.employees);
      await upload.mutateAsync(body).catch(() => undefined);
    },
  });

  return (
    <form
      noValidate
      className="grid gap-4 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="transactions">
        {(field) => (
          <FileDrop
            label={t("data.form.transactions")}
            prompt={t("data.form.dropTransactions")}
            accept=".csv,text/csv"
            name={field.name}
            file={field.state.value}
            onFile={(file) => field.handleChange(file)}
            onBlur={field.handleBlur}
            error={fieldError(field.state.meta.errors, tUi)}
            formatSize={size}
            removeLabel={t("data.form.remove")}
          />
        )}
      </form.Field>
      <div className="flex flex-col gap-2">
        <form.Subscribe selector={(state) => state.values.employeesFrom}>
          {(employeesFrom) =>
            employeesFrom ? (
              <form.Field name="employeesFrom">
                {(field) => (
                  <SelectField
                    label={t("data.form.employeesFrom")}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  >
                    {previous.map((dataset) => (
                      <option key={dataset.id} value={dataset.id}>
                        {dataset.name}
                      </option>
                    ))}
                  </SelectField>
                )}
              </form.Field>
            ) : (
              <form.Field name="employees">
                {(field) => (
                  <FileDrop
                    label={t("data.form.employees")}
                    prompt={t("data.form.dropEmployees")}
                    accept=".csv,text/csv"
                    name={field.name}
                    file={field.state.value}
                    onFile={(file) => field.handleChange(file)}
                    onBlur={field.handleBlur}
                    error={fieldError(field.state.meta.errors, tUi)}
                    formatSize={size}
                    removeLabel={t("data.form.remove")}
                  />
                )}
              </form.Field>
            )
          }
        </form.Subscribe>
        {previous.length > 0 ? (
          <form.Subscribe selector={(state) => state.values.employeesFrom}>
            {(employeesFrom) => (
              <button
                type="button"
                className="self-start text-sm font-semibold text-primary hover:underline"
                onClick={() => {
                  if (employeesFrom) {
                    form.setFieldValue("employeesFrom", "");
                    return;
                  }
                  form.setFieldValue("employees", null);
                  form.setFieldValue("employeesFrom", previous[0]?.id ?? "");
                }}
              >
                {t(employeesFrom ? "data.form.uploadEmployees" : "data.form.reuseEmployees")}
              </button>
            )}
          </form.Subscribe>
        ) : null}
      </div>
      <form.Field name="name">
        {(field) => (
          <TextField
            label={t("data.form.name")}
            hint={t("data.form.nameHint")}
            placeholder={t("data.form.namePlaceholder")}
            autoComplete="off"
            className="md:col-span-2"
            name={field.name}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            error={fieldError(field.state.meta.errors, tUi)}
          />
        )}
      </form.Field>
      <p className="text-sm text-muted md:col-span-2">{t("data.form.limits")}</p>
      {upload.isError ? (
        <p role="alert" className="text-high md:col-span-2">
          {uploadErrorMessage(upload.error, t, tUi)}
        </p>
      ) : null}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <div className="flex flex-col gap-3 md:col-span-2">
            {isSubmitting ? (
              <div
                role="progressbar"
                aria-label={t("data.form.uploading")}
                className="h-1.5 overflow-hidden rounded-full bg-soft"
              >
                <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {t(isSubmitting ? "data.form.uploading" : "data.form.submit")}
              </Button>
              <Button onClick={onCancel} disabled={isSubmitting}>
                {t("data.form.cancel")}
              </Button>
            </div>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}
