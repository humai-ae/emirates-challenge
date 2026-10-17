import { createFileRoute } from "@tanstack/react-router";
import { SecondOpinionsPage } from "../../../features/second-opinions/second-opinions-page";

export const Route = createFileRoute("/_app/analyst/second-opinions/")({
  component: SecondOpinionsRoute,
});

function SecondOpinionsRoute() {
  const { api } = Route.useRouteContext();
  return <SecondOpinionsPage api={api} />;
}
