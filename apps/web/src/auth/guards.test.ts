import type { ApiClient, User } from "@hrcc/shared";
import { setSignedInUser } from "@hrcc/ui/app";
import { QueryClient } from "@tanstack/react-query";
import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { redirectSignedIn, requireRole, requireUser } from "./guards";

function makeUser(role: User["role"], mustChangePassword = false): User {
  return {
    id: "8f0f4b8e-4a52-4f7e-9a39-1d5f6c0e2a11",
    email: "someone@emirates.test",
    displayName: "Someone",
    role,
    locale: "en",
    team: null,
    mustChangePassword,
  };
}

function context(user: User | null) {
  const queryClient = new QueryClient();
  setSignedInUser(queryClient, user);
  return { queryClient, api: {} as ApiClient };
}

const at = (pathname: string) => ({ pathname });

async function redirectOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => {
      throw new Error("expected a redirect");
    },
    (thrown: unknown) => thrown,
  );
  if (!isRedirect(error)) throw new Error("expected a redirect");
  return error.options;
}

describe("route guards", () => {
  it("sends signed-out visitors to sign-in", async () => {
    const options = await redirectOf(
      requireUser({ context: context(null), location: at("/home") }),
    );
    expect(options.to).toBe("/sign-in");
  });

  it("returns the signed-in user", async () => {
    const user = makeUser("analyst");
    await expect(requireUser({ context: context(user), location: at("/home") })).resolves.toEqual({
      user,
    });
  });

  it("sends the admin to the console with a full page load", async () => {
    const options = await redirectOf(
      requireUser({ context: context(makeUser("admin")), location: at("/home") }),
    );
    expect(options.href).toBe("/admin/");
    expect(options.reloadDocument).toBe(true);
  });

  it("keeps a user with a temporary password on the change-password page", async () => {
    const user = makeUser("auditor", true);
    const options = await redirectOf(
      requireUser({ context: context(user), location: at("/audit/log") }),
    );
    expect(options.to).toBe("/account/password");
    await expect(
      requireUser({ context: context(user), location: at("/account/password") }),
    ).resolves.toEqual({ user });
  });

  it("sends a user with the wrong role to Home", () => {
    let error: unknown;
    try {
      requireRole(makeUser("lead"), "auditor");
    } catch (thrown) {
      error = thrown;
    }
    if (!isRedirect(error)) throw new Error("expected a redirect");
    expect(error.options.to).toBe("/home");
  });

  it("sends signed-in visitors away from the sign-in page", async () => {
    const options = await redirectOf(redirectSignedIn({ context: context(makeUser("auditor")) }));
    expect(options.to).toBe("/home");
  });
});
