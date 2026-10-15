import { createFileRoute } from "@tanstack/react-router";
import { SetupPage } from "../../features/setup/setup-page";

export const Route = createFileRoute("/_app/setup")({ component: SetupRoute });

function SetupRoute() {
  const { api } = Route.useRouteContext();
  return <SetupPage api={api} />;
}
