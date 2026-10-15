import {
  type ApiClient,
  type CreateUserRequestInput,
  CreateUserRequestSchema,
  LOCALES,
  LocaleSchema,
  type ManagedUser,
  ROLES,
  RoleSchema,
} from "@hrcc/shared";
import { apiErrorMessage, Button, fieldError, SelectField, TextField } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

const EMPTY: CreateUserRequestInput = {
  displayName: "",
  email: "",
  role: "analyst",
  teamId: null,
  locale: "en",
  password: "",
};

export function CreateUserForm({
  api,
  onCreated,
  onCancel,
}: {
  api: ApiClient;
  onCreated: (user: ManagedUser) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const teams = useQuery({ queryKey: ["teams"], queryFn: () => api.listTeams() });
  const create = useMutation({
    mutationFn: (input: CreateUserRequestInput) => api.createUser(input),
    onSuccess: ({ user }) => onCreated(user),
  });
  const form = useForm({
    defaultValues: EMPTY,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: CreateUserRequestSchema },
    onSubmit: async ({ value }) => {
      await create.mutateAsync(value).catch(() => undefined);
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
      <form.Field name="displayName">
        {(field) => (
          <TextField
            label={t("users.form.displayName")}
            autoComplete="off"
            name={field.name}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            error={fieldError(field.state.meta.errors, tUi)}
          />
        )}
      </form.Field>
      <form.Field name="email">
        {(field) => (
          <TextField
            label={t("users.form.email")}
            type="email"
            autoComplete="off"
            name={field.name}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            error={fieldError(field.state.meta.errors, tUi)}
          />
        )}
      </form.Field>
      <form.Field name="role">
        {(field) => (
          <SelectField
            label={t("users.form.role")}
            name={field.name}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => {
              const role = RoleSchema.parse(event.target.value);
              field.handleChange(role);
              if (role !== "lead") form.setFieldValue("teamId", null);
            }}
            error={fieldError(field.state.meta.errors, tUi)}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {tUi(`roles.${role}`)}
              </option>
            ))}
          </SelectField>
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.values.role}>
        {(role) =>
          role === "lead" ? (
            <form.Field name="teamId">
              {(field) => (
                <SelectField
                  label={t("users.form.team")}
                  name={field.name}
                  value={field.state.value ?? ""}
                  onBlur={field.handleBlur}
                  onChange={(event) =>
                    field.handleChange(event.target.value === "" ? null : event.target.value)
                  }
                  error={fieldError(field.state.meta.errors, tUi)}
                >
                  <option value="">{t("users.form.chooseTeam")}</option>
                  {(teams.data?.teams ?? []).map((team) => (
                    <option key={team.id} value={team.id}>
                      {locale === "ar" ? (team.nameAr ?? team.nameEn) : team.nameEn}
                    </option>
                  ))}
                </SelectField>
              )}
            </form.Field>
          ) : null
        }
      </form.Subscribe>
      <form.Field name="locale">
        {(field) => (
          <SelectField
            label={t("users.form.language")}
            name={field.name}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(LocaleSchema.parse(event.target.value))}
          >
            {LOCALES.map((value) => (
              <option key={value} value={value} lang={value}>
                {tUi(`language.${value}`)}
              </option>
            ))}
          </SelectField>
        )}
      </form.Field>
      <form.Field name="password">
        {(field) => (
          <TextField
            label={t("users.form.password")}
            hint={t("users.form.passwordHint")}
            autoComplete="off"
            name={field.name}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            error={fieldError(field.state.meta.errors, tUi)}
          />
        )}
      </form.Field>
      {create.isError ? (
        <p role="alert" className="text-high md:col-span-2">
          {apiErrorMessage(create.error, tUi)}
        </p>
      ) : null}
      <div className="flex gap-2 md:col-span-2">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {t("users.form.submit")}
            </Button>
          )}
        </form.Subscribe>
        <Button onClick={onCancel}>{t("users.form.cancel")}</Button>
      </div>
    </form>
  );
}
