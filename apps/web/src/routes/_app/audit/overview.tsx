import { createFileRoute } from "@tanstack/react-router";
import { EmptyPage } from "../../../components/empty-page";

export const Route = createFileRoute("/_app/audit/overview")({
  component: () => <EmptyPage page="overview" />,
});
