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
    const options = await redirectOf(requireAdmin({ context: context(null) }));
    expect(options.href).toBe("/sign-in");
    expect(options.reloadDocument).toBe(true);
  });

  it("sends other roles back to the web app", async () => {
    const options = await redirectOf(requireAdmin({ context: context(makeUser("analyst")) }));
    expect(options.href).toBe("/");
    expect(options.reloadDocument).toBe(true);
  });

  it("lets an admin in", async () => {
    const admin = makeUser("admin");
    await expect(requireAdmin({ context: context(admin) })).resolves.toEqual({ user: admin });
  });
});
