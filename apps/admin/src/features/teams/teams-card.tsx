import {
  type ApiClient,
  type TeamRequest,
  TeamRequestSchema,
  type TeamResponse,
} from "@hrcc/shared";
import { apiErrorMessage, Button, Card, fieldError, TextField } from "@hrcc/ui";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ROUTING_QUERY_KEY, TEAMS_QUERY_KEY } from "./teams-query";

function TeamForm({
  initial,
  submit,
  onDone,
  onCancel,
}: {
  initial: TeamRequest;
  submit: (body: TeamRequest) => Promise<TeamResponse>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const save = useMutation({ mutationFn: submit, onSuccess: onDone });
  const form = useForm({
    defaultValues: initial,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: TeamRequestSchema },
    onSubmit: async ({ value }) => {
      await save
        .mutateAsync({ nameEn: value.nameEn.trim(), nameAr: value.nameAr.trim() })
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
      <form.Field name="nameEn">
        {(field) => (
          <TextField
            label={t("teams.list.nameEn")}
            name={field.name}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            error={fieldError(field.state.meta.errors, tUi) ?? undefined}
          />
        )}
      </form.Field>
      <form.Field name="nameAr">
        {(field) => (
          <TextField
            label={t("teams.list.nameAr")}
            hint={t("teams.list.nameArHint")}
            dir="rtl"
            name={field.name}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            error={fieldError(field.state.meta.errors, tUi) ?? undefined}
          />
        )}
      </form.Field>
      {save.isError ? (
        <p role="alert" className="text-high">
          {apiErrorMessage(save.error, tUi)}
        </p>
      ) : null}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {t("teams.list.save")}
            </Button>
            <Button onClick={onCancel} disabled={isSubmitting}>
              {t("teams.list.cancel")}
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}

/** The teams, with their English and Arabic names. */
export function TeamsCard({ api }: { api: ApiClient }) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const teams = useQuery({ queryKey: TEAMS_QUERY_KEY, queryFn: () => api.listTeams() });
  // A team's id, "new", or null.
  const [editing, setEditing] = useState<string | null>(null);
  const done = () => {
    setEditing(null);
    void queryClient.invalidateQueries({ queryKey: TEAMS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ROUTING_QUERY_KEY });
  };
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{t("teams.list.title")}</h2>
        {editing === null ? (
          <Button onClick={() => setEditing("new")}>{t("teams.list.add")}</Button>
        ) : null}
      </div>
      {editing === "new" ? (
        <div className="mb-3">
          <TeamForm
            initial={{ nameEn: "", nameAr: "" }}
            submit={(body) => api.createTeam(body)}
            onDone={done}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : null}
      <ul>
        {(teams.data?.teams ?? []).map((team) => (
          <li
            key={team.id}
            data-testid="team-row"
            className="border-b border-line py-3 last:border-b-0"
          >
            {editing === team.id ? (
              <TeamForm
                initial={{ nameEn: team.nameEn, nameAr: team.nameAr ?? "" }}
                submit={(body) => api.updateTeam(team.id, body)}
                onDone={done}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    <bdi>{team.nameEn}</bdi>
                  </p>
                  <p className="text-sm text-muted">
                    {team.nameAr ? <bdi dir="rtl">{team.nameAr}</bdi> : t("teams.list.noArabic")}
                  </p>
                </div>
                {editing === null ? (
                  <Button onClick={() => setEditing(team.id)}>{t("teams.list.edit")}</Button>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
