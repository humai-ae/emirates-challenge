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

const FILE_USES = ["transactions", "employees"] as const;
type FileUse = (typeof FILE_USES)[number];

/** A first guess from the file's name; otherwise the first use not taken yet. */
export function guessUse(name: string, taken: readonly FileUse[]): FileUse {
  if (/employee|staff|personnel/i.test(name)) return "employees";
  if (/transaction|txn/i.test(name)) return "transactions";
  return taken.includes("transactions") ? "employees" : "transactions";
}

const ChosenFileSchema = z
  .object({ file: z.custom<File>(), use: z.enum(FILE_USES) })
  .superRefine(({ file }, context) => {
    if (!/\.csv$/i.test(file.name)) {
      context.addIssue({ code: "custom", path: ["file"], message: "file_not_csv" });
    } else if (file.size > MAX_UPLOAD_BYTES) {
      context.addIssue({ code: "custom", path: ["file"], message: "file_too_large" });
    }
  });

const UploadFormSchema = z
  .object({
    name: z.string().max(120, { error: "too_long" }),
    files: z.array(ChosenFileSchema),
    /** An earlier dataset whose employees file to reuse; "" means a file in the list. */
    employeesFrom: z.string(),
  })
  .superRefine((value, context) => {
    const count = (use: FileUse) => value.files.filter((chosen) => chosen.use === use).length;
    const problem = (message: string) =>
      context.addIssue({ code: "custom", path: ["files"], message });
    if (count("transactions") === 0) problem("transactions_file_required");
    if (count("transactions") > 1 || count("employees") > 1) problem("one_file_per_use");
    if (value.employeesFrom && count("employees") > 0) problem("employees_twice");
    if (!value.employeesFrom && count("employees") === 0) problem("employees_file_required");
  });

type UploadFormValues = z.infer<typeof UploadFormSchema>;
const EMPTY: UploadFormValues = { name: "", files: [], employeesFrom: "" };

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
  const upload = useMutation({
    mutationFn: (body: FormData) => api.uploadDataset(body),
    onSuccess: ({ dataset }) => onUploaded(dataset),
  });
  const form = useForm({
    defaultValues: EMPTY,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: UploadFormSchema },
    onSubmit: async ({ value }) => {
      const fileFor = (use: FileUse) => value.files.find((chosen) => chosen.use === use)?.file;
      const body = new FormData();
      if (value.name.trim()) body.set("name", value.name.trim());
      const transactions = fileFor("transactions");
      if (transactions) body.set("transactions", transactions);
      const employees = fileFor("employees");
      if (value.employeesFrom) body.set("employeesFromDatasetId", value.employeesFrom);
      else if (employees) body.set("employees", employees);
      await upload.mutateAsync(body).catch(() => undefined);
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
      <form.Subscribe selector={(state) => state.values.employeesFrom}>
        {(employeesFrom) => (
          <form.Field name="files" mode="array">
            {(filesField) => (
              <div className="flex flex-col gap-3">
                <FileDrop
                  label={t("data.form.files")}
                  prompt={t("data.form.dropFiles")}
                  hint={t("data.form.limits")}
                  accept=".csv,text/csv"
                  multiple
                  error={fieldError(filesField.state.meta.errors, tUi)}
                  onFiles={(files) => {
                    const taken = filesField.state.value.map((chosen) => chosen.use);
                    for (const file of files) {
                      const use = guessUse(file.name, taken);
                      taken.push(use);
                      filesField.pushValue({ file, use });
                    }
                  }}
                />
                {filesField.state.value.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {filesField.state.value.map((chosen, index) => (
                      <li
                        key={`${chosen.file.name}-${index}`}
                        data-testid="chosen-file"
                        className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-white px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold">
                            <bdi>{chosen.file.name}</bdi>
                          </div>
                          <div className="text-sm text-muted">
                            {formatSize(chosen.file.size, locale)}
                          </div>
                          <form.Field name={`files[${index}].file`}>
                            {(fileField) => {
                              const message = fieldError(fileField.state.meta.errors, tUi);
                              return message ? (
                                <p className="text-sm text-high">{message}</p>
                              ) : null;
                            }}
                          </form.Field>
                        </div>
                        <form.Field name={`files[${index}].use`}>
                          {(useField) => (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="font-semibold">{t("data.form.usedFor")}</span>
                              <select
                                aria-label={t("data.form.useFor", { file: chosen.file.name })}
                                className="rounded-[10px] border border-control bg-white px-3 py-2"
                                value={useField.state.value}
                                onBlur={useField.handleBlur}
                                onChange={(event) =>
                                  useField.handleChange(
                                    FILE_USES.find((use) => use === event.target.value) ??
                                      "transactions",
                                  )
                                }
                              >
                                {FILE_USES.map((use) => (
                                  <option
                                    key={use}
                                    value={use}
                                    disabled={use === "employees" && employeesFrom !== ""}
                                  >
                                    {t(`data.form.uses.${use}`)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </form.Field>
                        <button
                          type="button"
                          aria-label={t("data.form.removeFile", { file: chosen.file.name })}
                          className="text-sm font-semibold text-primary hover:underline"
                          onClick={() => filesField.removeValue(index)}
                        >
                          {t("data.form.remove")}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </form.Field>
        )}
      </form.Subscribe>
      {previous.length > 0 ? (
        <form.Subscribe selector={(state) => state.values.employeesFrom}>
          {(employeesFrom) => (
            <div className="flex flex-col gap-2">
              {employeesFrom ? (
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
              ) : null}
              <button
                type="button"
                className="self-start text-sm font-semibold text-primary hover:underline"
                onClick={() =>
                  form.setFieldValue("employeesFrom", employeesFrom ? "" : (previous[0]?.id ?? ""))
                }
              >
                {t(employeesFrom ? "data.form.uploadEmployees" : "data.form.reuseEmployees")}
              </button>
            </div>
          )}
        </form.Subscribe>
      ) : null}
      <form.Field name="name">
        {(field) => (
          <TextField
            label={t("data.form.name")}
            hint={t("data.form.nameHint")}
            placeholder={t("data.form.namePlaceholder")}
            autoComplete="off"
            name={field.name}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            error={fieldError(field.state.meta.errors, tUi)}
          />
        )}
      </form.Field>
      {upload.isError ? (
        <p role="alert" className="text-high">
          {uploadErrorMessage(upload.error, t, tUi)}
        </p>
      ) : null}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <div className="flex flex-col gap-3">
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
