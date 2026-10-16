import { createFileRoute } from "@tanstack/react-router";
import { QueuePage } from "../../../features/flags/queue-page";

export const Route = createFileRoute("/_app/lead/queue")({ component: QueueRoute });

function QueueRoute() {
  const { api } = Route.useRouteContext();
  return <QueuePage api={api} />;
}
