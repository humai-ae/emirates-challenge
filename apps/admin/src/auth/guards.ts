import type { ApiClient, User } from "@hrcc/shared";
import { meQueryOptions } from "@hrcc/ui/app";
import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { WEB_SIGN_IN_URL, WEB_URL } from "../config";

export interface GuardContext {
  queryClient: QueryClient;
  api: ApiClient;
}

/** Sign-in and the other roles live in the web app, so both redirects are full page loads. */
export async function requireAdmin({
  context,
}: {
  context: GuardContext;
}): Promise<{ user: User }> {
  const user = await context.queryClient.query(meQueryOptions(context.api));
  if (!user) throw redirect({ href: WEB_SIGN_IN_URL, reloadDocument: true });
  if (user.role !== "admin") throw redirect({ href: WEB_URL, reloadDocument: true });
  return { user };
}
