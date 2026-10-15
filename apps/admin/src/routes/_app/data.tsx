import { createFileRoute } from "@tanstack/react-router";
import { EmptyPage } from "../../components/empty-page";

export const Route = createFileRoute("/_app/data")({
  component: () => <EmptyPage page="data" />,
});
