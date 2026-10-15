import { createFileRoute } from "@tanstack/react-router";
import { EmptyPage } from "../../../components/empty-page";

export const Route = createFileRoute("/_app/analyst/second-opinions")({
  component: () => <EmptyPage page="secondOpinions" />,
});
