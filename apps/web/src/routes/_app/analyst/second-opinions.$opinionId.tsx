import { createFileRoute } from "@tanstack/react-router";
import { SecondOpinionPage } from "../../../features/second-opinions/second-opinion-page";

export const Route = createFileRoute("/_app/analyst/second-opinions/$opinionId")({
  component: SecondOpinionRoute,
});

function SecondOpinionRoute() {
  const { api } = Route.useRouteContext();
  const { opinionId } = Route.useParams();
  return <SecondOpinionPage key={opinionId} api={api} opinionId={opinionId} />;
}
