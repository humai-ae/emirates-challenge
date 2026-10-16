import { type ApiClient, FLAG_REASON_MAX, type FlagDetail, flagText } from "@hrcc/shared";
import { apiErrorMessage, Button, Card, fieldError } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { teamNameFor } from "../../lib/team-name";
import type { OnFlagChanged } from "./flag-page";
import { flagConflictMessage, formatMoment } from "./format";
import { TextAreaField } from "./text-area-field";

const SendBackSchema = z.object({ reason: flagText(FLAG_REASON_MAX) });

/** The analyst checks the team's fix: closed, or back to the team with what is still wrong. */
export function FixCheckPanel({
  api,
  flag,
  onChanged,
  onConflict,
}: {
  api: ApiClient;
  flag: FlagDetail;
  onChanged: OnFlagChanged;
  onConflict: (message: string) => void;
}) {
  const { t } = useTranslation("web");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const [sending, setSending] = useState(false);
  const team = teamNameFor(flag.ownerTeam, locale) ?? "";
  const onError = (error: unknown) => {
    const message = flagConflictMessage(error, t);
    if (message) onConflict(message);
  };
  const verify = useMutation({
    mutationFn: () => api.verifyFlag(flag.id, { rowVersion: flag.rowVersion }),
    onSuccess: (response) => onChanged(response, t("fixCheck.closed")),
    onError,
  });
  const sendBack = useMutation({
    mutationFn: (reason: string) =>
      api.sendBackFlag(flag.id, { rowVersion: flag.rowVersion, reason }),
    onSuccess: (response) => onChanged(response, t("fixCheck.sentBack", { team })),
    onError,
  });
  const form = useForm({
    defaultValues: { reason: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: SendBackSchema },
    onSubmit: async ({ value }) => {
      await sendBack.mutateAsync(value.reason.trim()).catch(() => undefined);
    },
  });
  const failed = [verify, sendBack].find(
    (mutation) => mutation.isError && !flagConflictMessage(mutation.error, t),
  );
  return (
    <Card data-testid="fix-check-panel">
      <h2 className="mb-2 text-lg font-bold">{t("fixCheck.title")}</h2>
      {flag.fix ? (
        <>
          <p dir="auto">
            <span className="font-semibold">{t(`flags.fixType.${flag.fix.type}`)}</span>:{" "}
            {flag.fix.note}
          </p>
          <p className="text-sm text-muted">
            {t("fixCheck.by", { by: flag.fix.by, date: formatMoment(flag.fix.at, locale) })}
          </p>
        </>
      ) : null}
      {sending ? (
        <form
          noValidate
          className="mt-3 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="reason">
            {(field) => (
              <TextAreaField
                label={t("fixCheck.wrong")}
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                error={fieldError(field.state.meta.errors, tUi)}
              />
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="danger" disabled={isSubmitting}>
                  {t("fixCheck.sendBack", { team })}
                </Button>
                <Button onClick={() => setSending(false)}>{t("fixCheck.cancel")}</Button>
              </div>
            )}
          </form.Subscribe>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" disabled={verify.isPending} onClick={() => verify.mutate()}>
            {t("fixCheck.close")}
          </Button>
          <Button variant="danger" onClick={() => setSending(true)}>
            {t("fixCheck.notFixed")}
          </Button>
        </div>
      )}
      {failed ? (
        <p role="alert" className="mt-2 text-high">
          {apiErrorMessage(failed.error, tUi)}
        </p>
      ) : null}
    </Card>
  );
}
