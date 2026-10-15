import { meQueryOptions } from "@hrcc/ui/app";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "../../features/home/home-page";

export const Route = createFileRoute("/_app/home")({ component: HomeRoute });

function HomeRoute() {
  const { api } = Route.useRouteContext();
  const { data: user } = useQuery(meQueryOptions(api));
  return user ? <HomePage user={user} /> : null;
}
