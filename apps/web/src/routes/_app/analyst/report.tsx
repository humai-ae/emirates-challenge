import { createFileRoute } from "@tanstack/react-router";
import { ReportPage } from "../../../features/report/report-page";

export const Route = createFileRoute("/_app/analyst/report")({ component: ReportRoute });

function ReportRoute() {
  const { api } = Route.useRouteContext();
  return <ReportPage api={api} />;
}
