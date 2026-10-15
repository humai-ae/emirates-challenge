import type { ApiClient, User } from "@hrcc/shared";
import { meQueryOptions } from "@hrcc/ui/app";
import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { WEB_SIGN_IN_URL, WEB_URL } from "../config";

export interface GuardContext {
  queryClient: QueryClient;
  api: ApiClient;
}

/**
 * Sign-in and the other roles live in the web app, so those redirects are full page loads.
 * A required password change comes first; the path may or may not include /admin.
 */
export async function requireAdmin({
  context,
  location,
}: {
  context: GuardContext;
  location: { pathname: string };
}): Promise<{ user: User }> {
  const user = await context.queryClient.query(meQueryOptions(context.api));
  if (!user) throw redirect({ href: WEB_SIGN_IN_URL, reloadDocument: true });
  if (user.role !== "admin") throw redirect({ href: WEB_URL, reloadDocument: true });
  if (user.mustChangePassword && !location.pathname.endsWith("/account/password")) {
    throw redirect({ to: "/account/password" });
  }
  return { user };
}
