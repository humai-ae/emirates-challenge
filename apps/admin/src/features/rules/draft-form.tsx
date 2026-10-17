import {
  type ApiClient,
  ApiError,
  CRITERIA_MAX_ITEMS,
  CRITERION_MAX_LENGTH,
  type ParameterIssue,
  type ParameterValue,
  ParameterValueSchema,
  PRESET_CATALOGUE,
  PRESET_IDS,
  type PresetId,
  PresetIdSchema,
  type Rule,
  type RuleResponse,
  type RulesDataset,
  type RuleVersion,
  SEVERITIES,
  type Severity,
  SeveritySchema,
  type UpdateDraftRequest,
} from "@hrcc/shared";
import {
  apiErrorMessage,
  Button,
  Card,
  cx,
  fieldError,
  SelectField,
  Tag,
  TextField,
} from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { revalidateLogic, useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ParameterField } from "./parameter-field";
import { ReasonDialog } from "./reason-dialog";
import { valuesOf } from "./rule-format";
import { RulePreview, useRulePreview } from "./rule-preview";

interface DraftValues {
  preset: PresetId | "";
  values: Record<string, ParameterValue>;
  severity: Severity;
  /** "" means the team for each transaction type. */
  ownerTeamId: string;
  suggestedActionEn: string;
  suggestedActionAr: string;
  /** What counts for a judgment rule, one item per line. */
  meets: string;
  doesNotMeet: string;
}

/** A list typed one item per line: blank and repeated lines dropped. */
const linesOf = (text: string) => [
  ...new Set(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== ""),
  ),
];

const isJudgment = (preset: PresetId | "") =>
  preset !== "" && PRESET_CATALOGUE[preset].checkKind === "judgment";

const Suggested = z.string().trim().min(1, { error: "required" }).max(300, { error: "too_long" });
const DraftFormSchema = z
  .object({
    preset: z
      .union([PresetIdSchema, z.literal("")])
      .refine((preset) => preset !== "", { error: "required" }),
    values: z.record(z.string(), ParameterValueSchema),
    severity: SeveritySchema,
    ownerTeamId: z.string(),
    suggestedActionEn: Suggested,
    suggestedActionAr: Suggested,
    meets: z.string(),
    doesNotMeet: z.string(),
  })
  .superRefine((value, ctx) => {
    // Only a judgment rule keeps what counts; another check type ignores the lists.
    if (!isJudgment(value.preset)) return;
    for (const name of ["meets", "doesNotMeet"] as const) {
      const lines = linesOf(value[name]);
      if (lines.length > CRITERIA_MAX_ITEMS) {
        ctx.addIssue({ code: "custom", path: [name], message: "too_many_lines" });
      } else if (lines.some((line) => line.length > CRITERION_MAX_LENGTH)) {
        ctx.addIssue({ code: "custom", path: [name], message: "line_too_long" });
      }
    }
  });

/** The values a check type takes, keeping those it shares with the previous one. */
function valuesFor(preset: PresetId, previous: Readonly<Record<string, ParameterValue>>) {
  return Object.fromEntries(
    PRESET_CATALOGUE[preset].parameters.map((spec) => [spec.name, previous[spec.name] ?? null]),
  );
}

function problemsOf(issues: readonly ParameterIssue[]): Record<string, string> {
  return Object.fromEntries(issues.map((issue) => [issue.parameter, issue.problem]));
}

/** Problems by parameter when the API refuses a save: `values.<parameter>` paths. */
function refusedValues(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.body.code !== "validation_failed") return {};
  const issues = error.body.params.issues;
  if (!Array.isArray(issues)) return {};
  return Object.fromEntries(
    issues.flatMap((issue: { path?: unknown; message?: unknown }) =>
      typeof issue.path === "string" &&
      issue.path.startsWith("values.") &&
      typeof issue.message === "string"
        ? [[issue.path.slice("values.".length), issue.message]]
        : [],
    ),
  );
}

/** The open draft: its check type, values and settings, saved, approved or rejected here. */
export function DraftForm({
  api,
  rule,
  version,
  dataset,
  onChanged,
}: {
  api: ApiClient;
  rule: Rule;
  version: RuleVersion;
  dataset: RulesDataset | null;
  onChanged: (response: RuleResponse) => void;
}) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const teams = useQuery({ queryKey: ["teams"], queryFn: () => api.listTeams() });
  const save = useMutation({
    mutationFn: (body: UpdateDraftRequest) => api.updateRuleDraft(rule.id, body),
    onSuccess: onChanged,
  });
  const approve = useMutation({
    mutationFn: () => api.approveRule(rule.id, { rowVersion: rule.rowVersion }),
    onSuccess: onChanged,
  });
  // The page remounts this form after every change, so these are the saved values.
  const [saved] = useState<DraftValues>(() => ({
    preset: version.preset ?? "",
    values: valuesOf(version),
    severity: version.severity,
    ownerTeamId: version.ownerTeam?.id ?? "",
    suggestedActionEn: version.suggestedActionEn,
    suggestedActionAr: version.suggestedActionAr,
    meets: version.criteria?.meets.join("\n") ?? "",
    doesNotMeet: version.criteria?.doesNotMeet.join("\n") ?? "",
  }));
  const form = useForm({
    defaultValues: saved,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: DraftFormSchema },
    onSubmit: async ({ value }) => {
      if (!value.preset) return;
      const meets = linesOf(value.meets);
      const doesNotMeet = linesOf(value.doesNotMeet);
      await save
        .mutateAsync({
          rowVersion: rule.rowVersion,
          preset: value.preset,
          values: value.values,
          severity: value.severity,
          ownerTeamId: value.ownerTeamId || null,
          suggestedActionEn: value.suggestedActionEn.trim(),
          suggestedActionAr: value.suggestedActionAr.trim(),
          // Both lists empty: AI judges from the rule alone.
          ...(isJudgment(value.preset)
            ? { criteria: meets.length + doesNotMeet.length > 0 ? { meets, doesNotMeet } : null }
            : {}),
        })
        .catch(() => undefined);
    },
  });
  const preset = useStore(form.store, (state) => state.values.preset);
  const values = useStore(form.store, (state) => state.values.values);
  const unsaved = useStore(
    form.store,
    (state) => JSON.stringify(state.values) !== JSON.stringify(saved),
  );
  const preview = useRulePreview(api, preset || null, values);
  const refused = refusedValues(save.error);
  const problems = {
    ...(preview.data?.result.status === "invalid_parameters"
      ? problemsOf(preview.data.result.issues)
      : {}),
    ...refused,
  };
  // What AI was least sure of in its draft: a parameter, or "preset" for the check type.
  const weakest = version.draftedBy === "ai" ? (version.draftMeta?.ai?.weakest ?? null) : null;
  const editedBefore = (name: string) =>
    version.preset === preset &&
    (version.parameters.find((parameter) => parameter.name === name)?.editedByAdmin ?? false);

  return (
    <>
      <Card>
        <h2 className="mb-3 text-lg font-bold">{t("rules.form.title")}</h2>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="preset">
            {(field) => (
              <SelectField
                label={t("rules.form.checkType")}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  const next = PRESET_IDS.find((id) => id === event.target.value);
                  field.handleChange(next ?? "");
                  if (next) form.setFieldValue("values", valuesFor(next, form.state.values.values));
                }}
                error={fieldError(field.state.meta.errors, tUi)}
              >
                <option value="">{t("rules.form.chooseCheckType")}</option>
                {PRESET_IDS.map((id) => (
                  <option key={id} value={id}>
                    {t(`rules.presets.${id}`)}
                  </option>
                ))}
              </SelectField>
            )}
          </form.Field>
          {weakest === "preset" ? (
            <p className="-mt-2">
              <Tag tone="ai">{t("rules.form.leastSure")}</Tag>
            </p>
          ) : null}
          {preset ? (
            <form.Field name="values">
              {(field) => (
                <>
                  {PRESET_CATALOGUE[preset].parameters.map((spec) => (
                    <ParameterField
                      key={`${preset}:${spec.name}`}
                      spec={spec}
                      value={field.state.value[spec.name] ?? null}
                      onChange={(next) =>
                        field.handleChange({ ...field.state.value, [spec.name]: next })
                      }
                      dataset={dataset}
                      edited={editedBefore(spec.name)}
                      leastSure={weakest === spec.name}
                      problem={problems[spec.name] ?? null}
                    />
                  ))}
                </>
              )}
            </form.Field>
          ) : null}
          {isJudgment(preset) ? (
            <fieldset className="flex flex-col gap-3">
              <legend className="font-semibold">{t("rules.form.criteria")}</legend>
              <p className="text-sm text-muted">{t("rules.form.criteriaHint")}</p>
              {(["meets", "doesNotMeet"] as const).map((name) => (
                <form.Field key={name} name={name}>
                  {(field) => (
                    <LinesField
                      label={t(`rules.form.${name}`)}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={field.handleChange}
                      error={fieldError(field.state.meta.errors, tUi)}
                    />
                  )}
                </form.Field>
              ))}
            </fieldset>
          ) : null}
          <form.Field name="severity">
            {(field) => (
              <SelectField
                label={t("rules.form.severity")}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) =>
                  field.handleChange(
                    SEVERITIES.find((severity) => severity === event.target.value) ?? "Medium",
                  )
                }
              >
                {SEVERITIES.map((severity) => (
                  <option key={severity} value={severity}>
                    {t(`rules.severity.${severity}`)}
                  </option>
                ))}
              </SelectField>
            )}
          </form.Field>
          <form.Field name="ownerTeamId">
            {(field) => (
              <SelectField
                label={t("rules.form.owner")}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              >
                <option value="">{t("rules.form.ownerByType")}</option>
                {(teams.data?.teams ?? []).map((team) => (
                  <option key={team.id} value={team.id}>
                    {locale === "ar" ? (team.nameAr ?? team.nameEn) : team.nameEn}
                  </option>
                ))}
              </SelectField>
            )}
          </form.Field>
          {(["suggestedActionEn", "suggestedActionAr"] as const).map((name) => (
            <form.Field key={name} name={name}>
              {(field) => (
                <TextField
                  label={t(
                    name === "suggestedActionEn"
                      ? "rules.form.suggestedEn"
                      : "rules.form.suggestedAr",
                  )}
                  dir={name === "suggestedActionAr" ? "rtl" : "ltr"}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  error={fieldError(field.state.meta.errors, tUi)}
                />
              )}
            </form.Field>
          ))}
          {version.draftMeta?.suggestedActionBy === "ai" ? (
            <p className="-mt-2 text-sm text-ai">{t("rules.form.suggestedByAi")}</p>
          ) : null}
          {save.isError && Object.keys(refused).length === 0 ? (
            <p role="alert" className="text-high">
              {apiErrorMessage(save.error, tUi)}
            </p>
          ) : null}
          {approve.isError ? (
            <p role="alert" className="text-high">
              {apiErrorMessage(approve.error, tUi)}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {t(isSubmitting ? "rules.form.saving" : "rules.form.save")}
                </Button>
              )}
            </form.Subscribe>
            <Button
              variant="primary"
              disabled={unsaved || version.status !== "draft" || approve.isPending}
              onClick={() => approve.mutate()}
            >
              {t("rules.form.approve")}
            </Button>
            <ReasonDialog
              kind="reject"
              rule={rule}
              act={(input) => api.rejectRule(rule.id, input)}
              onDone={onChanged}
            />
          </div>
          {unsaved ? <p className="text-sm text-muted">{t("rules.form.approveHint")}</p> : null}
        </form>
      </Card>
      <RulePreview query={preview} preset={preset || null} />
    </>
  );
}

/** A list typed one item per line. */
function LinesField({
  label,
  name,
  value,
  onBlur,
  onChange,
  error,
}: {
  label: string;
  name: string;
  value: string;
  onBlur: () => void;
  onChange: (value: string) => void;
  error: string | undefined;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <textarea
        id={id}
        rows={3}
        dir="auto"
        name={name}
        value={value}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
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
}
