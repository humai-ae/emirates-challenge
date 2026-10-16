import {
  type ApiClient,
  ConfirmMappingRequestSchema,
  FINDING_FIELDS,
  type FindingField,
  type FindingFormat,
  type FindingFormatResponse,
} from "@hrcc/shared";
import { apiErrorMessage, Button, fieldError } from "@hrcc/ui";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

const CELL = "border-b border-line px-2.5 py-2";
const HEADINGS = ["column", "example", "field"] as const;

/** Which field goes in each column of the format; blank columns stay empty in the export. */
export function MappingForm({
  api,
  format,
  onConfirmed,
}: {
  api: ApiClient;
  format: FindingFormat;
  onConfirmed: (response: FindingFormatResponse) => void;
}) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const confirm = useMutation({
    mutationFn: (mapping: Array<FindingField | null>) =>
      api.confirmFindingMapping(format.id, { rowVersion: format.rowVersion, mapping }),
    onSuccess: onConfirmed,
  });
  const toMapping = (choices: ReadonlyArray<FindingField | "">) =>
    choices.map((choice) => choice || null);
  const form = useForm({
    defaultValues: {
      mapping: format.mapping.map((field) => field ?? "") as Array<FindingField | "">,
    },
    validationLogic: revalidateLogic(),
    validators: {
      // The shared schema's message is a validation key, such as mapping_incomplete.
      onDynamic: ({ value }) => {
        const result = ConfirmMappingRequestSchema.safeParse({
          rowVersion: format.rowVersion,
          mapping: toMapping(value.mapping),
        });
        return result.success ? undefined : result.error.issues[0]?.message;
      },
    },
    onSubmit: async ({ value }) => {
      await confirm.mutateAsync(toMapping(value.mapping)).catch(() => undefined);
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
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {HEADINGS.map((heading) => (
              <th key={heading} className={`${CELL} text-start text-sm font-semibold text-muted`}>
                {t(`findingFormat.mapping.${heading}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {format.columns.map((column, index) => (
            <tr key={`${column}-${index}`} data-testid="format-column" className="align-top">
              <td className={`${CELL} font-mono text-sm`}>
                <bdi>{column}</bdi>
              </td>
              <td className={`${CELL} text-sm text-muted`}>
                <bdi>{format.examples[0]?.[index] ?? ""}</bdi>
              </td>
              <td className={CELL}>
                <form.Field name={`mapping[${index}]`}>
                  {(field) => (
                    <select
                      aria-label={t("findingFormat.mapping.fieldFor", { column })}
                      className="rounded-[10px] border border-control bg-white px-3 py-2"
                      value={field.state.value ?? ""}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(
                          FINDING_FIELDS.find((name) => name === event.target.value) ?? "",
                        )
                      }
                    >
                      <option value="">{t("findingFormat.mapping.blank")}</option>
                      {FINDING_FIELDS.map((name) => (
                        <option key={name} value={name}>
                          {t(`findingFormat.fields.${name}`)}
                        </option>
                      ))}
                    </select>
                  )}
                </form.Field>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form.Subscribe selector={(state) => state.errors}>
        {(errors) => {
          const message = fieldError(errors, tUi);
          return message ? (
            <p role="alert" className="mt-3 text-high">
              {message}
            </p>
          ) : null;
        }}
      </form.Subscribe>
      {confirm.isError ? (
        <p role="alert" className="mt-3 text-high">
          {apiErrorMessage(confirm.error, tUi)}
        </p>
      ) : null}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" variant="primary" className="mt-4" disabled={isSubmitting}>
            {t(isSubmitting ? "findingFormat.mapping.saving" : "findingFormat.mapping.confirm")}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
