import {
  type ApiClient,
  type ConfirmFlagRequest,
  DISMISS_REASONS_FOR,
  type DismissReason,
  FLAG_NOTE_MAX,
  FLAG_REASON_MAX,
  type FlagDetail,
  flagText,
  SEVERITIES,
  type Severity,
  SeveritySchema,
  SUGGESTED_FIX_MAX,
} from "@hrcc/shared";
import { apiErrorMessage, Button, Card, fieldError, SelectField } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { teamNameFor } from "../../lib/team-name";
import type { OnFlagChanged } from "./flag-page";
import { flagConflictMessage } from "./format";
import { TextAreaField } from "./text-area-field";

interface PanelProps {
  api: ApiClient;
  flag: FlagDetail;
  onChanged: OnFlagChanged;
  onConflict: (message: string) => void;
}

/** The analyst's decision: confirm to the owner team, or dismiss with a reason and a note. */
export function DecisionPanel(props: PanelProps) {
  const { flag } = props;
  const { t } = useTranslation("web");
  const { locale } = useLocaleSwitch();
  const [mode, setMode] = useState<"ask" | "confirm" | "dismiss">("ask");
  const pattern = flag.kind === "unusual_pattern";
  const team = teamNameFor(flag.ownerTeam, locale);
  return (
    <Card data-testid="decision-panel">
      <h2 className="mb-3 text-lg font-bold">
        {t(pattern ? "decide.patternQuestion" : "decide.question")}
      </h2>
      {mode === "ask" ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setMode("confirm")}>
            {pattern
              ? t("decide.yesPattern")
              : team
                ? t("decide.yesTo", { team })
                : t("decide.yesChoose")}
          </Button>
          <Button variant="danger" onClick={() => setMode("dismiss")}>
            {t(pattern ? "decide.noPattern" : "decide.no")}
          </Button>
        </div>
      ) : null}
      {mode === "confirm" ? <ConfirmForm {...props} onCancel={() => setMode("ask")} /> : null}
      {mode === "dismiss" ? <DismissForm {...props} onCancel={() => setMode("ask")} /> : null}
      <p className="mt-3 text-sm text-muted">{t("decide.footer")}</p>
    </Card>
  );
}

function ConfirmForm({
  api,
  flag,
  onChanged,
  onConflict,
  onCancel,
}: PanelProps & { onCancel: () => void }) {
  const { t } = useTranslation("web");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const currentFix = locale === "ar" ? flag.suggestedFixAr : flag.suggestedFixEn;
  const ownerId = flag.ownerTeam?.id ?? "";
  const confirm = useMutation({
    mutationFn: (input: ConfirmFlagRequest) => api.confirmFlag(flag.id, input),
    onSuccess: (response) =>
      onChanged(
        response,
        t("decide.confirmed", { team: teamNameFor(response.flag.ownerTeam, locale) ?? "" }),
      ),
    onError: (error) => {
      const message = flagConflictMessage(error, t);
      if (message) onConflict(message);
    },
  });
  const schema = z
    .object({
      teamId: z.string(),
      severity: SeveritySchema,
      suggestedFix: flagText(SUGGESTED_FIX_MAX),
      reason: z.string().max(FLAG_REASON_MAX, { error: "too_long" }),
    })
    .superRefine((value, context) => {
      if (!value.teamId) {
        context.addIssue({ code: "custom", path: ["teamId"], message: "flag_team_required" });
      }
      const changed =
        (ownerId !== "" && value.teamId !== ownerId) ||
        value.severity !== flag.severity ||
        value.suggestedFix.trim() !== currentFix;
      if (changed && !value.reason.trim()) {
        context.addIssue({ code: "custom", path: ["reason"], message: "flag_change_reason" });
      }
    });
  const form = useForm({
    defaultValues: {
      teamId: ownerId,
      severity: flag.severity as Severity,
      suggestedFix: currentFix,
      reason: "",
    },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: schema },
    onSubmit: async ({ value }) => {
      const input: ConfirmFlagRequest = { rowVersion: flag.rowVersion };
      if (value.teamId !== ownerId) input.ownerTeamId = value.teamId;
      if (value.severity !== flag.severity) input.severity = value.severity;
      if (value.suggestedFix.trim() !== currentFix) input.suggestedFix = value.suggestedFix.trim();
      if (value.reason.trim()) input.reason = value.reason.trim();
      await confirm.mutateAsync(input).catch(() => undefined);
    },
  });
  const teamOptions = flag.teams.map((team) => (
    <option key={team.id} value={team.id}>
      {teamNameFor(team, locale)}
    </option>
  ));
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Subscribe selector={(state) => [state.values.teamId, state.values.severity] as const}>
        {([teamId, severity]) => {
          const chosen = flag.teams.find((team) => team.id === teamId) ?? null;
          const level = t(`flags.severity.${severity}`);
          return (
            <p>
              {chosen
                ? t("decide.willGo", { team: teamNameFor(chosen, locale), severity: level })
                : t("decide.willGoChoose", { severity: level })}
            </p>
          );
        }}
      </form.Subscribe>
      {ownerId === "" ? (
        <form.Field name="teamId">
          {(field) => (
            <SelectField
              label={t("decide.team")}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              error={fieldError(field.state.meta.errors, tUi)}
            >
              <option value="">{t("decide.chooseTeam")}</option>
              {teamOptions}
            </SelectField>
          )}
        </form.Field>
      ) : null}
      <details className="rounded-[10px] border border-line p-3">
        <summary className="cursor-pointer font-semibold">{t("decide.change")}</summary>
        <div className="mt-3 flex flex-col gap-3">
          <form.Field name="severity">
            {(field) => (
              <SelectField
                label={t("decide.severity")}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value as Severity)}
              >
                {SEVERITIES.map((level) => (
                  <option key={level} value={level}>
                    {t(`flags.severity.${level}`)}
                  </option>
                ))}
              </SelectField>
            )}
          </form.Field>
          {ownerId !== "" ? (
            <form.Field name="teamId">
              {(field) => (
                <SelectField
                  label={t("decide.teamLabel")}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                >
                  {teamOptions}
                </SelectField>
              )}
            </form.Field>
          ) : null}
          <form.Field name="suggestedFix">
            {(field) => (
              <TextAreaField
                label={t("decide.suggestedFix")}
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                error={fieldError(field.state.meta.errors, tUi)}
              />
            )}
          </form.Field>
        </div>
      </details>
      <form.Field name="reason">
        {(field) => (
          <TextAreaField
            label={t("decide.reason")}
            rows={2}
            value={field.state.value}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
            error={fieldError(field.state.meta.errors, tUi)}
          />
        )}
      </form.Field>
      {confirm.isError && !flagConflictMessage(confirm.error, t) ? (
        <p role="alert" className="text-high">
          {apiErrorMessage(confirm.error, tUi)}
        </p>
      ) : null}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {t("decide.confirm")}
            </Button>
            <Button onClick={onCancel}>{t("decide.cancel")}</Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}

function DismissForm({
  api,
  flag,
  onChanged,
  onConflict,
  onCancel,
}: PanelProps & { onCancel: () => void }) {
  const { t } = useTranslation("web");
  const { t: tUi } = useTranslation("ui");
  const reasons = DISMISS_REASONS_FOR[flag.kind];
  const pattern = flag.kind === "unusual_pattern";
  const dismiss = useMutation({
    mutationFn: (input: { reason: DismissReason; note: string }) =>
      api.dismissFlag(flag.id, { rowVersion: flag.rowVersion, ...input }),
    onSuccess: (response) => onChanged(response, t("decide.dismissed")),
    onError: (error) => {
      const message = flagConflictMessage(error, t);
      if (message) onConflict(message);
    },
  });
  const schema = z.object({
    reason: z.string().refine((value) => reasons.includes(value as DismissReason), {
      error: "flag_reason_required",
    }),
    note: flagText(FLAG_NOTE_MAX),
  });
  const form = useForm({
    defaultValues: { reason: "", note: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: schema },
    onSubmit: async ({ value }) => {
      await dismiss
        .mutateAsync({ reason: value.reason as DismissReason, note: value.note.trim() })
        .catch(() => undefined);
    },
  });
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="reason">
        {(field) => {
          const error = fieldError(field.state.meta.errors, tUi);
          return (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-sm font-semibold">{t("decide.why")}</legend>
              {reasons.map((reason) => (
                <label key={reason} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="dismiss-reason"
                    value={reason}
                    checked={field.state.value === reason}
                    onChange={() => field.handleChange(reason)}
                  />
                  {t(`flags.dismissReason.${reason}`)}
                </label>
              ))}
              {error ? <p className="text-sm text-high">{error}</p> : null}
            </fieldset>
          );
        }}
      </form.Field>
      <form.Field name="note">
        {(field) => (
          <TextAreaField
            label={t("decide.note")}
            value={field.state.value}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
            error={fieldError(field.state.meta.errors, tUi)}
          />
        )}
      </form.Field>
      {dismiss.isError && !flagConflictMessage(dismiss.error, t) ? (
        <p role="alert" className="text-high">
          {apiErrorMessage(dismiss.error, tUi)}
        </p>
      ) : null}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" disabled={isSubmitting}>
              {t(pattern ? "decide.dismissPattern" : "decide.dismiss")}
            </Button>
            <Button onClick={onCancel}>{t("decide.cancel")}</Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}
