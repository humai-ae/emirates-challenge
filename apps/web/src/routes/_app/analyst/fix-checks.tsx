import { createFileRoute } from "@tanstack/react-router";
import { FixChecksPage } from "../../../features/flags/fix-checks-page";

export const Route = createFileRoute("/_app/analyst/fix-checks")({ component: FixChecksRoute });

function FixChecksRoute() {
  const { api } = Route.useRouteContext();
  return <FixChecksPage api={api} />;
}
