import { createFileRoute } from "@tanstack/react-router";
import { FindingFormatPage } from "../../features/runs/finding-format-page";

export const Route = createFileRoute("/_app/finding-format")({ component: FindingFormatRoute });

function FindingFormatRoute() {
  const { api } = Route.useRouteContext();
  return <FindingFormatPage api={api} />;
}
