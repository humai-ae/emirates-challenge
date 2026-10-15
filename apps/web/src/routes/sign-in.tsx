import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { redirectSignedIn } from "../auth/guards";
import { homeFor } from "../auth/home";
import { completeSignIn } from "../auth/session-actions";
import { SignInPage } from "../features/sign-in/sign-in-page";

export const Route = createFileRoute("/sign-in")({
  beforeLoad: redirectSignedIn,
  component: SignInRoute,
});

function SignInRoute() {
  const { api, queryClient } = Route.useRouteContext();
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  async function onSignIn(userId: string): Promise<void> {
    const user = await completeSignIn({ api, queryClient, i18n, userId });
    const home = homeFor(user.role);
    if (home.kind === "external") {
      window.location.assign(home.href);
      return;
    }
    await navigate({ to: home.to });
  }
  return <SignInPage api={api} onSignIn={onSignIn} />;
}
