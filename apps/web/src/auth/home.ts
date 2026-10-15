import type { Role } from "@hrcc/shared";
import { redirect } from "@tanstack/react-router";
import { ADMIN_URL } from "../config";

export type Home =
  | { kind: "app"; to: "/analyst/report" | "/lead/queue" | "/audit/overview" }
  | { kind: "external"; href: string };

export function homeFor(role: Role): Home {
  switch (role) {
    case "admin":
      return { kind: "external", href: ADMIN_URL };
    case "analyst":
      return { kind: "app", to: "/analyst/report" };
    case "lead":
      return { kind: "app", to: "/lead/queue" };
    case "auditor":
      return { kind: "app", to: "/audit/overview" };
  }
}

/** A redirect to the role's home; the admin console is another app, so it is a full page load. */
export function redirectHome(role: Role) {
  const home = homeFor(role);
  return home.kind === "external"
    ? redirect({ href: home.href, reloadDocument: true })
    : redirect({ to: home.to });
}
