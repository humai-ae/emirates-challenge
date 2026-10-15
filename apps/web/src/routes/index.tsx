import { meQueryOptions } from "@hrcc/ui/app";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { redirectHome } from "../auth/home";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.query(meQueryOptions(context.api));
    if (!user) throw redirect({ to: "/sign-in" });
    throw redirectHome(user);
  },
});
