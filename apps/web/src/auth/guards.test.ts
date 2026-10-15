import type { ApiClient, User } from "@hrcc/shared";
import { setSignedInUser } from "@hrcc/ui/app";
import { QueryClient } from "@tanstack/react-query";
import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { redirectSignedIn, requireRole, requireUser } from "./guards";

function makeUser(role: User["role"]): User {
  return {
    id: "8f0f4b8e-4a52-4f7e-9a39-1d5f6c0e2a11",
    username: "someone",
    displayName: "Someone",
    role,
    locale: "en",
    team: null,
  };
}

function context(user: User | null) {
  const queryClient = new QueryClient();
  setSignedInUser(queryClient, user);
  return { queryClient, api: {} as ApiClient };
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("expected a redirect");
    },
    (error: unknown) => error,
  );
}

describe("route guards", () => {
  it("sends signed-out visitors to sign-in", async () => {
    const error = await caught(requireUser({ context: context(null) }));
    if (!isRedirect(error)) throw new Error("expected a redirect");
    expect(error.options.to).toBe("/sign-in");
  });

  it("returns the signed-in user", async () => {
    const user = makeUser("analyst");
    await expect(requireUser({ context: context(user) })).resolves.toEqual({ user });
  });

  it("sends a user with the wrong role to their own home", () => {
    let error: unknown;
    try {
      requireRole(makeUser("lead"), "auditor");
    } catch (thrown) {
      error = thrown;
    }
    if (!isRedirect(error)) throw new Error("expected a redirect");
    expect(error.options.to).toBe("/lead/queue");
  });

  it("sends an admin to the admin console with a full page load", () => {
    let error: unknown;
    try {
      requireRole(makeUser("admin"), "analyst");
    } catch (thrown) {
      error = thrown;
    }
    if (!isRedirect(error)) throw new Error("expected a redirect");
    expect(error.options.href).toBe("/admin/");
    expect(error.options.reloadDocument).toBe(true);
  });

  it("sends signed-in visitors away from the sign-in page", async () => {
    const error = await caught(redirectSignedIn({ context: context(makeUser("auditor")) }));
    if (!isRedirect(error)) throw new Error("expected a redirect");
    expect(error.options.to).toBe("/audit/overview");
  });
});
