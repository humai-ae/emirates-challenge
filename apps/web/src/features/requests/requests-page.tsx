import { type ApiClient, ApiError, CreateRuleRequestSchema, type RuleRequest } from "@hrcc/shared";
import {
  apiErrorMessage,
  Button,
  Card,
  cx,
  EmptyState,
  fieldError,
  PageHeader,
  Tag,
  type TagTone,
} from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

const REQUESTS_QUERY_KEY = ["rule-requests"] as const;
const TONES: Record<RuleRequest["outcome"], TagTone> = {
  drafting: "ai",
  waiting: "warn",
  live: "ok",
  rejected: "neutral",
  retired: "neutral",
};

/** An analyst asks for a rule; an admin reviews it before it runs. */
export function RequestsPage({ api }: { api: ApiClient }) {
  const { t } = useTranslation("web");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const id = useId();
  const queryClient = useQueryClient();
  const [sent, setSent] = useState(false);
  const requests = useQuery({
    queryKey: REQUESTS_QUERY_KEY,
    queryFn: () => api.listRuleRequests(),
    refetchInterval: (current) =>
      current.state.data?.requests.some((item) => item.outcome === "drafting") ? 2_000 : false,
  });
  const ask = useMutation({
    mutationFn: (text: string) => api.requestRule({ text }),
    onSuccess: () => {
      setSent(true);
      void queryClient.invalidateQueries({ queryKey: REQUESTS_QUERY_KEY });
    },
  });
  const form = useForm({
    defaultValues: { text: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: CreateRuleRequestSchema },
    onSubmit: async ({ value, formApi }) => {
      setSent(false);
      await ask
        .mutateAsync(value.text.trim())
        .then(() => formApi.reset())
        .catch(() => undefined);
    },
  });
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-AE-u-nu-latn" : "en-GB", {
      dateStyle: "medium",
    }).format(new Date(iso));
  const noData = ask.error instanceof ApiError && ask.error.body.code === "no_dataset";

  return (
    <>
      <PageHeader title={t("requests.title")} subtitle={t("requests.subtitle")} />
      <Card className="mb-4">
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="text">
            {(field) => {
              const error = fieldError(field.state.meta.errors, tUi);
              return (
                <div className="flex flex-col gap-1">
                  <label htmlFor={id} className="text-sm font-semibold">
                    {t("requests.text")}
                  </label>
                  <textarea
                    id={id}
                    rows={3}
                    dir="auto"
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${id}-hint ${id}-error` : `${id}-hint`}
                    className={cx(
                      "rounded-[10px] border bg-white px-3 py-2",
                      error ? "border-high" : "border-control",
                    )}
                  />
                  <p id={`${id}-hint`} className="text-sm text-muted">
                    {t("requests.hint")}
                  </p>
                  {error ? (
                    <p id={`${id}-error`} className="text-sm text-high">
                      {error}
                    </p>
                  ) : null}
                </div>
              );
            }}
          </form.Field>
          {ask.isError ? (
            <p role="alert" className="text-high">
              {noData ? t("requests.noData") : apiErrorMessage(ask.error, tUi)}
            </p>
          ) : null}
          {sent ? (
            <p role="status" className="text-ok">
              {t("requests.sent")}
            </p>
          ) : null}
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <div>
                <Button type="submit" variant="primary" disabled={isSubmitting}>
                  {t("requests.submit")}
                </Button>
              </div>
            )}
          </form.Subscribe>
        </form>
      </Card>
      <h2 className="mb-2 text-lg font-bold">{t("requests.mineTitle")}</h2>
      {requests.isPending ? <p className="text-muted">{tUi("states.loading")}</p> : null}
      {requests.isError ? <p className="text-high">{tUi("states.error")}</p> : null}
      {requests.data && requests.data.requests.length === 0 ? (
        <EmptyState title={t("requests.none")}>{t("requests.subtitle")}</EmptyState>
      ) : null}
      <ul className="flex flex-col gap-3">
        {(requests.data?.requests ?? []).map((item) => (
          <li key={item.ruleId} data-testid="rule-request">
            <Card>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">
                  <bdi>{item.ruleId}</bdi>
                </span>
                <Tag tone={TONES[item.outcome]}>{t(`requests.outcome.${item.outcome}`)}</Tag>
                <span className="text-sm text-muted">
                  {t("requests.requested", { date: date(item.requestedAt) })}
                </span>
              </div>
              <p dir="auto">{item.text}</p>
              {item.reason ? (
                <p className="mt-1 text-sm">{t("requests.reason", { reason: item.reason })}</p>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
