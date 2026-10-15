import { describe, expect, it } from "vitest";
import { homeFor } from "./home";

describe("homeFor", () => {
  it("sends every web role to Home and the admin to the console", () => {
    for (const role of ["analyst", "lead", "auditor"] as const) {
      expect(homeFor({ role, mustChangePassword: false })).toEqual({ kind: "app", to: "/home" });
    }
    expect(homeFor({ role: "admin", mustChangePassword: false })).toEqual({
      kind: "external",
      href: "/admin/",
    });
  });

  it("sends a user with a temporary password to change it first", () => {
    expect(homeFor({ role: "analyst", mustChangePassword: true })).toEqual({
      kind: "app",
      to: "/account/password",
    });
    // The admin console handles its own required change.
    expect(homeFor({ role: "admin", mustChangePassword: true })).toEqual({
      kind: "external",
      href: "/admin/",
    });
  });
});
