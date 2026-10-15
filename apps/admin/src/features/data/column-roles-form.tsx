import {
  type ApiClient,
  type ConfirmRolesRequest,
  ConfirmRolesRequestSchema,
  type DatasetColumn,
  type DatasetDetail,
  type DatasetFileKind,
  EMPLOYEE_ROLES,
  TRANSACTION_ROLES,
} from "@hrcc/shared";
import { apiErrorMessage, Button, Card, fieldError, Tag } from "@hrcc/ui";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const FILES: readonly DatasetFileKind[] = ["transactions", "employees"];
const ROLES: Record<DatasetFileKind, readonly string[]> = {
  transactions: TRANSACTION_ROLES,
  employees: EMPLOYEE_ROLES,
};
const HEADINGS = ["column", "type", "samples", "role"] as const;
const CELL = "border-b border-line px-2.5 py-2";

/** The role chosen for each column, by file and column position; "" means not used. */
type RoleChoices = Record<DatasetFileKind, string[]>;

function choicesOf(columns: readonly DatasetColumn[]): RoleChoices {
  const choices: RoleChoices = { transactions: [], employees: [] };
  for (const column of columns) choices[column.file][column.position] = column.role ?? "";
  return choices;
}

export function toMapping(
  columns: readonly DatasetColumn[],
  choices: RoleChoices,
): ConfirmRolesRequest {
  const mapping: ConfirmRolesRequest = { transactions: {}, employees: {} };
  for (const column of columns) {
    const role = choices[column.file][column.position];
    if (!role) continue;
    const roles = mapping[column.file] as Record<string, string[]>;
    roles[role] = [...(roles[role] ?? []), column.name];
  }
  return mapping;
}

/**
 * The columns of both files with their roles. Unconfirmed roles are editable; confirmed ones are
 * shown read-only until an admin chooses to edit them. A deleted dataset is read-only.
 */
export function ColumnRolesForm({
  api,
  dataset,
  onConfirmed,
}: {
  api: ApiClient;
  dataset: DatasetDetail;
  onConfirmed: (dataset: DatasetDetail) => void;
}) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const deleted = dataset.status === "deleted";
  const [editing, setEditing] = useState(!dataset.columnsConfirmed);
  const readOnly = deleted || !editing;
  const confirm = useMutation({
    mutationFn: (mapping: ConfirmRolesRequest) => api.confirmDatasetRoles(dataset.id, mapping),
    onSuccess: ({ dataset: updated }) => {
      setEditing(false);
      onConfirmed(updated);
    },
  });
  const form = useForm({
    defaultValues: choicesOf(dataset.columns),
    validationLogic: revalidateLogic(),
    validators: {
      // The shared schema's message is a validation key, e.g. one_column_only.
      onDynamic: ({ value }) => {
        const result = ConfirmRolesRequestSchema.safeParse(toMapping(dataset.columns, value));
        return result.success ? undefined : result.error.issues[0]?.message;
      },
    },
    onSubmit: async ({ value }) => {
      await confirm.mutateAsync(toMapping(dataset.columns, value)).catch(() => undefined);
    },
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      {FILES.map((file) => (
        <Card key={file} className="mb-4">
          <h2 className="mb-3 text-lg font-bold">{t(`dataset.columns.title.${file}`)}</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {HEADINGS.map((heading) => (
                  <th
                    key={heading}
                    className={`${CELL} text-start text-sm font-semibold text-muted`}
                  >
                    {t(`dataset.columns.${heading}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataset.columns
                .filter((column) => column.file === file)
                .map((column) => (
                  <tr key={column.position} data-testid="dataset-column" className="align-top">
                    <td className={`${CELL} font-mono text-sm`}>
                      <bdi>{column.name}</bdi>
                    </td>
                    <td className={CELL}>
                      {t(`dataset.types.${column.type}`)}
                      {column.dateFormat ? (
                        <div className="font-mono text-xs text-muted">
                          <bdi>{column.dateFormat}</bdi>
                        </div>
                      ) : null}
                      {column.dateAmbiguous ? (
                        <div className="mt-1">
                          <Tag tone="warn">{t("dataset.columns.ambiguous")}</Tag>
                        </div>
                      ) : null}
                    </td>
                    <td className={`${CELL} text-sm text-muted`}>
                      <bdi>{column.samples.join(", ")}</bdi>
                    </td>
                    <td className={CELL}>
                      {readOnly ? (
                        t(`dataset.roles.${column.role ?? "none"}`)
                      ) : (
                        <form.Field name={`${file}[${column.position}]`}>
                          {(field) => (
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                aria-label={t("dataset.columns.roleFor", { column: column.name })}
                                className="rounded-[10px] border border-control bg-white px-3 py-2"
                                value={field.state.value ?? ""}
                                onBlur={field.handleBlur}
                                onChange={(event) => field.handleChange(event.target.value)}
                              >
                                <option value="">{t("dataset.roles.none")}</option>
                                {ROLES[file].map((role) => (
                                  <option key={role} value={role}>
                                    {t(`dataset.roles.${role}`)}
                                  </option>
                                ))}
                              </select>
                              {column.role && !column.roleConfident && !column.roleConfirmed ? (
                                <Tag tone="warn">{t("dataset.columns.check")}</Tag>
                              ) : null}
                            </div>
                          )}
                        </form.Field>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      ))}
      {deleted ? null : !editing ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="font-semibold text-ok">
            {t("dataset.columns.confirmedNote")}
          </p>
          <Button onClick={() => setEditing(true)}>{t("dataset.columns.edit")}</Button>
        </div>
      ) : (
        <>
          <form.Subscribe selector={(state) => state.errors}>
            {(errors) => {
              const message = fieldError(errors, tUi);
              return message ? (
                <p role="alert" className="mb-3 text-high">
                  {message}
                </p>
              ) : null;
            }}
          </form.Subscribe>
          {confirm.isError ? (
            <p role="alert" className="mb-3 text-high">
              {apiErrorMessage(confirm.error, tUi)}
            </p>
          ) : null}
          <div className="flex gap-2">
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" variant="primary" disabled={isSubmitting}>
                  {t(dataset.columnsConfirmed ? "dataset.columns.save" : "dataset.columns.confirm")}
                </Button>
              )}
            </form.Subscribe>
            {dataset.columnsConfirmed ? (
              <Button
                onClick={() => {
                  form.reset();
                  confirm.reset();
                  setEditing(false);
                }}
              >
                {t("dataset.columns.cancel")}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </form>
  );
}
