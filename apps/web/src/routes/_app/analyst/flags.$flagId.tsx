import { createFileRoute } from "@tanstack/react-router";
import { FlagPage } from "../../../features/flags/flag-page";

export const Route = createFileRoute("/_app/analyst/flags/$flagId")({ component: AnalystFlag });

function AnalystFlag() {
  const { api } = Route.useRouteContext();
  const { flagId } = Route.useParams();
  return <FlagPage key={flagId} api={api} flagId={flagId} reader="analyst" />;
}
