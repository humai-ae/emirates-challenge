import type { ApiClient, Role, User } from "@hrcc/shared";
import { meQueryOptions } from "@hrcc/ui/app";
import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { redirectHome } from "./home";

export interface GuardContext {
  queryClient: QueryClient;
  api: ApiClient;
}

export async function requireUser({ context }: { context: GuardContext }): Promise<{ user: User }> {
  const user = await context.queryClient.query(meQueryOptions(context.api));
  if (!user) throw redirect({ to: "/sign-in" });
  return { user };
}

export function requireRole(user: User, role: Role): void {
  if (user.role !== role) throw redirectHome(user.role);
}

export async function redirectSignedIn({ context }: { context: GuardContext }): Promise<void> {
  const user = await context.queryClient.query(meQueryOptions(context.api));
  if (user) throw redirectHome(user.role);
}
