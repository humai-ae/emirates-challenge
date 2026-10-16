import { FIX_TYPES, type FixType, FLAG_NOTE_MAX, flagText } from "@hrcc/shared";
import { apiErrorMessage, Button, Card, fieldError, SelectField } from "@hrcc/ui";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import type { ActionPanelProps } from "./flag-page";
import { flagConflictMessage } from "./format";
import { TextAreaField } from "./text-area-field";

const FixSchema = z.object({
  fixType: z.string().refine((value) => (FIX_TYPES as readonly string[]).includes(value), {
    error: "flag_fix_type_required",
  }),
  note: flagText(FLAG_NOTE_MAX),
});

/** The team lead's part: give the fix to someone in the team, then record what was done. */
export function LeadPanel(props: ActionPanelProps) {
  const { flag } = props;
  const { t } = useTranslation("web");
  if (flag.allowed.includes("fix")) {
    return (
      <Card data-testid="lead-panel">
        <h2 className="mb-2 text-lg font-bold">{t("lead.markFixed")}</h2>
        <FixForm {...props} />
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-primary">
            {t("lead.reassignTitle")}
          </summary>
          <div className="mt-2">
            <AssignForm {...props} />
          </div>
        </details>
      </Card>
    );
  }
  if (flag.allowed.includes("assign")) {
    return (
      <Card data-testid="lead-panel">
        <h2 className="mb-2 text-lg font-bold">{t("lead.assignTitle")}</h2>
        <AssignForm {...props} />
      </Card>
    );
  }
  return (
    <Card data-testid="lead-panel">
      <p>
        {flag.status === "fix_submitted"
          ? t("lead.waiting")
          : flag.status === "closed"
            ? t("lead.closed")
            : t("flag.nothingToDo", { status: t(`flags.status.${flag.status}`) })}
      </p>
    </Card>
  );
}

function AssignForm({ api, flag, onChanged, onConflict }: ActionPanelProps) {
  const { t } = useTranslation("web");
  const { t: tUi } = useTranslation("ui");
  const reassign = flag.status === "being_fixed";
  const [assigneeId, setAssigneeId] = useState(
    flag.assignment?.assigneeId ?? flag.assignees[0]?.id ?? "",
  );
  const assign = useMutation({
    mutationFn: (id: string) =>
      api.assignFlag(flag.id, { rowVersion: flag.rowVersion, assigneeId: id }),
    onSuccess: (response) =>
      onChanged(response, t("lead.assigned", { name: response.flag.assignee ?? "" })),
    onError: (error) => {
      const message = flagConflictMessage(error, t);
      if (message) onConflict(message);
    },
  });
  return (
    <div className="flex flex-col gap-2">
      <SelectField
        label={t(reassign ? "lead.reassignTo" : "lead.who")}
        value={assigneeId}
        onChange={(event) => setAssigneeId(event.target.value)}
      >
        {flag.assignees.map((person) => (
          <option key={person.id} value={person.id}>
            {person.displayName}
          </option>
        ))}
      </SelectField>
      <div>
        <Button
          variant={reassign ? "secondary" : "primary"}
          disabled={!assigneeId || assign.isPending}
          onClick={() => assign.mutate(assigneeId)}
        >
          {t(reassign ? "lead.reassign" : "lead.start")}
        </Button>
      </div>
      {assign.isError && !flagConflictMessage(assign.error, t) ? (
        <p role="alert" className="text-high">
          {apiErrorMessage(assign.error, tUi)}
        </p>
      ) : null}
    </div>
  );
}

function FixForm({ api, flag, onChanged, onConflict }: ActionPanelProps) {
  const { t } = useTranslation("web");
  const { t: tUi } = useTranslation("ui");
  const fix = useMutation({
    mutationFn: (input: { fixType: FixType; note: string }) =>
      api.fixFlag(flag.id, { rowVersion: flag.rowVersion, ...input }),
    onSuccess: (response) => onChanged(response, t("lead.fixed")),
    onError: (error) => {
      const message = flagConflictMessage(error, t);
      if (message) onConflict(message);
    },
  });
  const form = useForm({
    defaultValues: { fixType: "", note: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: FixSchema },
    onSubmit: async ({ value }) => {
      await fix
        .mutateAsync({ fixType: value.fixType as FixType, note: value.note.trim() })
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
      <p className="text-sm text-muted">{t("lead.fixFirst")}</p>
      <form.Field name="fixType">
        {(field) => {
          const error = fieldError(field.state.meta.errors, tUi);
          return (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-sm font-semibold">{t("lead.what")}</legend>
              {FIX_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="fix-type"
                    value={type}
                    checked={field.state.value === type}
                    onChange={() => field.handleChange(type)}
                  />
                  {t(`flags.fixType.${type}`)}
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
            label={t("lead.details")}
            placeholder={t("lead.detailsHint")}
            value={field.state.value}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
            error={fieldError(field.state.meta.errors, tUi)}
          />
        )}
      </form.Field>
      {fix.isError && !flagConflictMessage(fix.error, t) ? (
        <p role="alert" className="text-high">
          {apiErrorMessage(fix.error, tUi)}
        </p>
      ) : null}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <div>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {t("lead.submit")}
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}
