import { type LoginRequestInput, LoginRequestSchema } from "@hrcc/shared";
import {
  apiErrorMessage,
  Button,
  Card,
  fieldError,
  LanguageSwitch,
  SyntheticBadge,
  TextField,
} from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

/** The front page: email and password, nothing else about the users. */
export function SignInPage({
  onSignIn,
}: {
  onSignIn: (credentials: LoginRequestInput) => Promise<void>;
}) {
  const { t } = useTranslation("web");
  const { t: tUi } = useTranslation("ui");
  const { locale, setLocale } = useLocaleSwitch();
  const signIn = useMutation({
    mutationFn: (credentials: LoginRequestInput) => onSignIn(credentials),
  });
  const form = useForm({
    defaultValues: { email: "", password: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: LoginRequestSchema },
    onSubmit: async ({ value }) => {
      await signIn.mutateAsync(value).catch(() => undefined);
    },
  });

  return (
    <div className="min-h-screen">
      <header className="bg-brand text-white">
        <div className="mx-auto flex max-w-[1120px] items-center gap-3 px-6 py-3">
          <span className="font-bold">{tUi("appName")}</span>
          <SyntheticBadge />
          <span className="flex-1" />
          <LanguageSwitch value={locale} onChange={(next) => void setLocale(next)} />
        </div>
      </header>
      <main className="mx-auto flex max-w-[1120px] justify-center px-6 py-16">
        <Card className="w-full max-w-md">
          <h1 className="mb-1 text-2xl font-bold">{t("signIn.title")}</h1>
          <p className="mb-6 text-muted">{t("signIn.subtitle")}</p>
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <form.Field name="email">
              {(field) => (
                <TextField
                  label={t("signIn.email")}
                  type="email"
                  autoComplete="username"
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  error={fieldError(field.state.meta.errors, tUi)}
                />
              )}
            </form.Field>
            <form.Field name="password">
              {(field) => (
                <TextField
                  label={t("signIn.password")}
                  type="password"
                  autoComplete="current-password"
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  error={fieldError(field.state.meta.errors, tUi)}
                />
              )}
            </form.Field>
            {signIn.isError ? (
              <p role="alert" className="text-high">
                {apiErrorMessage(signIn.error, tUi)}
              </p>
            ) : null}
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting}
                  className="justify-center"
                >
                  {t("signIn.submit")}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </Card>
      </main>
    </div>
  );
}
