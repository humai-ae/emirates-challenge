import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RunsPage } from "../../features/runs/runs-page";

export const Route = createFileRoute("/_app/runs")({ component: RunsRoute });

function RunsRoute() {
  const { api } = Route.useRouteContext();
  const navigate = useNavigate();
  return (
    <RunsPage
      api={api}
      onStarted={(run) => void navigate({ to: "/runs/$runId", params: { runId: run.id } })}
    />
  );
}
