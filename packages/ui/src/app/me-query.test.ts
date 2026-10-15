import { type ApiClient, ApiError, type User } from "@hrcc/shared";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ME_QUERY_KEY, meQueryOptions, setSignedInUser } from "./me-query";

const user: User = {
  id: "8f0f4b8e-4a52-4f7e-9a39-1d5f6c0e2a11",
  username: "omar.siddiqui",
  displayName: "Omar Siddiqui",
  role: "analyst",
  locale: "en",
  team: null,
};

function fakeApi(getMe: ApiClient["getMe"]): ApiClient {
  return { getMe } as unknown as ApiClient;
}

describe("meQueryOptions", () => {
  it("returns the signed-in user", async () => {
    const queryClient = new QueryClient();
    const api = fakeApi(vi.fn().mockResolvedValue({ user }));
    await expect(queryClient.query(meQueryOptions(api))).resolves.toEqual(user);
  });

  it("returns null when the API says unauthenticated", async () => {
    const queryClient = new QueryClient();
    const api = fakeApi(
      vi.fn().mockRejectedValue(new ApiError(401, { code: "unauthenticated", params: {} })),
    );
    await expect(queryClient.query(meQueryOptions(api))).resolves.toBeNull();
  });

  it("rethrows other errors", async () => {
    const queryClient = new QueryClient();
    const api = fakeApi(
      vi.fn().mockRejectedValue(new ApiError(500, { code: "internal_error", params: {} })),
    );
    await expect(queryClient.query(meQueryOptions(api))).rejects.toBeInstanceOf(ApiError);
  });

  it("serves the cached value after setSignedInUser without refetching", async () => {
    const queryClient = new QueryClient();
    const getMe = vi.fn().mockResolvedValue({ user });
    setSignedInUser(queryClient, null);
    await expect(queryClient.query(meQueryOptions(fakeApi(getMe)))).resolves.toBeNull();
    setSignedInUser(queryClient, user);
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toEqual(user);
    expect(getMe).not.toHaveBeenCalled();
  });
});
