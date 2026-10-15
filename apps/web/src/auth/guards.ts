import type { ApiClient, Role, User } from "@hrcc/shared";
import { meQueryOptions } from "@hrcc/ui/app";
import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { redirectHome } from "./home";

export interface GuardContext {
  queryClient: QueryClient;
  api: ApiClient;
}

const PASSWORD_PAGE = "/account/password";

/** Signed-in web users only. Admins go to the console; a required password change comes first. */
export async function requireUser({
  context,
  location,
}: {
  context: GuardContext;
  location: { pathname: string };
}): Promise<{ user: User }> {
  const user = await context.queryClient.query(meQueryOptions(context.api));
  if (!user) throw redirect({ to: "/sign-in" });
  if (user.role === "admin") throw redirectHome(user);
  if (user.mustChangePassword && location.pathname !== PASSWORD_PAGE) {
    throw redirect({ to: PASSWORD_PAGE });
  }
  return { user };
}

export function requireRole(user: User, role: Role): void {
  if (user.role !== role) throw redirectHome(user);
}

export async function redirectSignedIn({ context }: { context: GuardContext }): Promise<void> {
  const user = await context.queryClient.query(meQueryOptions(context.api));
  if (user) throw redirectHome(user);
}
