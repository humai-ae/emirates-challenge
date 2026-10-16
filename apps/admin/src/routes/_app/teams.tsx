import { createFileRoute } from "@tanstack/react-router";
import { TeamsPage } from "../../features/teams/teams-page";

export const Route = createFileRoute("/_app/teams")({ component: TeamsRoute });

function TeamsRoute() {
  const { api } = Route.useRouteContext();
  return <TeamsPage api={api} />;
}
