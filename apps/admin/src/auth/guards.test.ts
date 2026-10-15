import type { ApiClient, User } from "@hrcc/shared";
import { setSignedInUser } from "@hrcc/ui/app";
import { QueryClient } from "@tanstack/react-query";
import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { requireAdmin } from "./guards";

function context(user: User | null) {
  const queryClient = new QueryClient();
  setSignedInUser(queryClient, user);
  return { queryClient, api: {} as ApiClient };
}

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

describe("requireAdmin", () => {
  it("sends signed-out visitors to the web sign-in page", async () => {
    const options = await redirectOf(
      requireAdmin({ context: context(null), location: at("/home") }),
    );
    expect(options.href).toBe("/sign-in");
    expect(options.reloadDocument).toBe(true);
  });

  it("sends other roles back to the web app", async () => {
    const options = await redirectOf(
      requireAdmin({ context: context(makeUser("analyst")), location: at("/home") }),
    );
    expect(options.href).toBe("/");
    expect(options.reloadDocument).toBe(true);
  });

  it("keeps an admin with a temporary password on the change-password page", async () => {
    const admin = makeUser("admin", true);
    const options = await redirectOf(
      requireAdmin({ context: context(admin), location: at("/admin/users") }),
    );
    expect(options.to).toBe("/account/password");
    await expect(
      requireAdmin({ context: context(admin), location: at("/admin/account/password") }),
    ).resolves.toEqual({ user: admin });
  });

  it("lets an admin in", async () => {
    const admin = makeUser("admin");
    await expect(requireAdmin({ context: context(admin), location: at("/home") })).resolves.toEqual(
      { user: admin },
    );
  });
});
