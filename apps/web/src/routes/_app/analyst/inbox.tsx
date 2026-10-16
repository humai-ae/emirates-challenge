import { createFileRoute } from "@tanstack/react-router";
import { InboxPage } from "../../../features/flags/inbox-page";

export const Route = createFileRoute("/_app/analyst/inbox")({ component: InboxRoute });

function InboxRoute() {
  const { api } = Route.useRouteContext();
  return <InboxPage api={api} />;
}
