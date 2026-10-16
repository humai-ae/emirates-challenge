import { createFileRoute } from "@tanstack/react-router";
import { FlagPage } from "../../../features/flags/flag-page";

export const Route = createFileRoute("/_app/lead/flags/$flagId")({ component: LeadFlag });

function LeadFlag() {
  const { api } = Route.useRouteContext();
  const { flagId } = Route.useParams();
  return <FlagPage key={flagId} api={api} flagId={flagId} reader="lead" />;
}
