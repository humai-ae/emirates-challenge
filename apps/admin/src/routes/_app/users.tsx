import { meQueryOptions } from "@hrcc/ui/app";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { UsersPage } from "../../features/users/users-page";

export const Route = createFileRoute("/_app/users")({ component: UsersRoute });

function UsersRoute() {
  const { api } = Route.useRouteContext();
  const { data: user } = useQuery(meQueryOptions(api));
  return user ? <UsersPage api={api} currentUser={user} /> : null;
}
