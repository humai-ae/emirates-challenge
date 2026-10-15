import type { ApiClient } from "@hrcc/shared";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

export interface RouterContext {
  queryClient: QueryClient;
  api: ApiClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({ component: Outlet });
