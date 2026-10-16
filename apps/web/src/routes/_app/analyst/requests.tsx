import { createFileRoute } from "@tanstack/react-router";
import { RequestsPage } from "../../../features/requests/requests-page";

export const Route = createFileRoute("/_app/analyst/requests")({ component: RequestsRoute });

function RequestsRoute() {
  const { api } = Route.useRouteContext();
  return <RequestsPage api={api} />;
}
