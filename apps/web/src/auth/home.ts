import type { User } from "@hrcc/shared";
import { redirect } from "@tanstack/react-router";
import { ADMIN_URL } from "../config";

export type Home =
  | { kind: "app"; to: "/home" | "/account/password" }
  | { kind: "external"; href: string };

type Who = Pick<User, "role" | "mustChangePassword">;

/** Where a signed-in user belongs: the admin console, a required password change, or Home. */
export function homeFor(user: Who): Home {
  if (user.role === "admin") return { kind: "external", href: ADMIN_URL };
  if (user.mustChangePassword) return { kind: "app", to: "/account/password" };
  return { kind: "app", to: "/home" };
}

/** A redirect to `homeFor(user)`; the admin console is another app, so that is a full page load. */
export function redirectHome(user: Who) {
  const home = homeFor(user);
  return home.kind === "external"
    ? redirect({ href: home.href, reloadDocument: true })
    : redirect({ to: home.to });
}
