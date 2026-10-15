import { createFileRoute } from "@tanstack/react-router";
import { requireRole } from "../../auth/guards";

export const Route = createFileRoute("/_app/lead")({
  beforeLoad: ({ context }) => requireRole(context.user, "lead"),
});
