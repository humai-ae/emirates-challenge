import {
  type ApiClient,
  type ChangePasswordRequest,
  PasswordAttemptSchema,
  PasswordSchema,
  type User,
} from "@hrcc/shared";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Button } from "../components/button";
import { TextField } from "../components/text-field";
import { apiErrorMessage, fieldError } from "../lib/messages";
import { setSignedInUser } from "./me-query";

const ChangePasswordFormSchema = z
  .object({
    currentPassword: PasswordAttemptSchema,
    newPassword: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    error: "passwords_mismatch",
    path: ["confirmPassword"],
  });

/** Changes the signed-in user's password; also completes a required change. */
export function ChangePasswordForm({
  api,
  onChanged,
}: {
  api: ApiClient;
  onChanged: (user: User) => void;
}) {
  const { t } = useTranslation("ui");
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: (input: ChangePasswordRequest) => api.changePassword(input),
    onSuccess: ({ user }) => {
      setSignedInUser(queryClient, user);
      onChanged(user);
    },
  });
  const form = useForm({
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: ChangePasswordFormSchema },
    onSubmit: async ({ value }) => {
      await change
        .mutateAsync({ currentPassword: value.currentPassword, newPassword: value.newPassword })
        .catch(() => undefined);
    },
  });

  return (
    <form
      noValidate
      className="flex max-w-md flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="currentPassword">
        {(field) => (
          <TextField
            label={t("account.currentPassword")}
            type="password"
            autoComplete="current-password"
            name={field.name}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            error={fieldError(field.state.meta.errors, t)}
          />
        )}
      </form.Field>
      <form.Field name="newPassword">
        {(field) => (
          <TextField
            label={t("account.newPassword")}
            hint={t("account.newPasswordHint")}
            type="password"
            autoComplete="new-password"
            name={field.name}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            error={fieldError(field.state.meta.errors, t)}
          />
        )}
      </form.Field>
      <form.Field name="confirmPassword">
        {(field) => (
          <TextField
            label={t("account.confirmPassword")}
            type="password"
            autoComplete="new-password"
            name={field.name}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            error={fieldError(field.state.meta.errors, t)}
          />
        )}
      </form.Field>
      {change.isError ? (
        <p role="alert" className="text-high">
          {apiErrorMessage(change.error, t)}
        </p>
      ) : null}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <div>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {t("account.submit")}
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}
