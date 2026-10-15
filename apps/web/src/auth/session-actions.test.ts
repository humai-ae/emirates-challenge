import type { ApiClient, User } from "@hrcc/shared";
import { ME_QUERY_KEY, storeLocale } from "@hrcc/ui/app";
import { QueryClient } from "@tanstack/react-query";
import i18next from "i18next";
import { describe, expect, it, vi } from "vitest";
import { completeSignIn, signOut } from "./session-actions";

const user: User = {
  id: "8f0f4b8e-4a52-4f7e-9a39-1d5f6c0e2a11",
  username: "omar.siddiqui",
  displayName: "Omar Siddiqui",
  role: "analyst",
  locale: "en",
  team: null,
};

function makeI18n() {
  const instance = i18next.createInstance();
  void instance.init({ lng: "en", resources: { en: {}, ar: {} } });
  return instance;
}

describe("completeSignIn", () => {
  it("uses the profile language when nothing was chosen in this browser", async () => {
    const api = {
      demoLogin: vi.fn().mockResolvedValue({ user: { ...user, locale: "ar" } }),
      updatePreferences: vi.fn(),
    } as unknown as ApiClient;
    const queryClient = new QueryClient();
    const i18n = makeI18n();
    const signedIn = await completeSignIn({ api, queryClient, i18n, userId: user.id });
    expect(signedIn.locale).toBe("ar");
    expect(api.updatePreferences).not.toHaveBeenCalled();
    expect(i18n.language).toBe("ar");
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toEqual(signedIn);
  });

  it("saves the language chosen in this browser to the profile", async () => {
    storeLocale("ar");
    const api = {
      demoLogin: vi.fn().mockResolvedValue({ user }),
      updatePreferences: vi.fn().mockResolvedValue({ user: { ...user, locale: "ar" } }),
    } as unknown as ApiClient;
    const i18n = makeI18n();
    const signedIn = await completeSignIn({
      api,
      queryClient: new QueryClient(),
      i18n,
      userId: user.id,
    });
    expect(api.updatePreferences).toHaveBeenCalledWith({ locale: "ar" });
    expect(signedIn.locale).toBe("ar");
    expect(i18n.language).toBe("ar");
  });
});

describe("signOut", () => {
  it("clears the session even when the API call fails", async () => {
    const api = { logout: vi.fn().mockRejectedValue(new Error("network")) } as unknown as ApiClient;
    const queryClient = new QueryClient();
    queryClient.setQueryData(ME_QUERY_KEY, user);
    queryClient.setQueryData(["audit", "list"], { pages: [] });
    await expect(signOut({ api, queryClient })).rejects.toThrow("network");
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toBeNull();
    expect(queryClient.getQueryData(["audit", "list"])).toBeUndefined();
  });
});
