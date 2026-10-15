import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "../auth/guards";
import { redirectHome } from "../auth/home";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    const { user } = await requireUser({ context });
    throw redirectHome(user.role);
  },
});
