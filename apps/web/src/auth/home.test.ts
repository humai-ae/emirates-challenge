import { describe, expect, it } from "vitest";
import { homeFor } from "./home";

describe("homeFor", () => {
  it("sends each role to its home", () => {
    expect(homeFor("analyst")).toEqual({ kind: "app", to: "/analyst/report" });
    expect(homeFor("lead")).toEqual({ kind: "app", to: "/lead/queue" });
    expect(homeFor("auditor")).toEqual({ kind: "app", to: "/audit/overview" });
    expect(homeFor("admin")).toEqual({ kind: "external", href: "/admin/" });
  });
});
