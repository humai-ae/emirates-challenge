import { createFileRoute } from "@tanstack/react-router";
import { RunPage } from "../../features/runs/run-page";

export const Route = createFileRoute("/_app/runs_/$runId")({ component: RunRoute });

function RunRoute() {
  const { api } = Route.useRouteContext();
  const { runId } = Route.useParams();
  return <RunPage api={api} runId={runId} />;
}
