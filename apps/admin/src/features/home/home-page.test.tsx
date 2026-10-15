import type { User } from "@hrcc/shared";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderInRouter } from "../../test/render";
import { HomePage } from "./home-page";

const layla: User = {
  id: "8f0f4b8e-4a52-4f7e-9a39-1d5f6c0e2a11",
  email: "layla.haddad@emirates.test",
  displayName: "Layla Haddad",
  role: "admin",
  locale: "en",
  team: null,
  mustChangePassword: false,
};

describe("HomePage", () => {
  it("greets the admin and links to every area of the console", async () => {
    renderInRouter(<HomePage user={layla} />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Welcome, Layla Haddad",
    );
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/setup",
      "/data",
      "/rules",
      "/runs",
      "/dashboard",
      "/teams",
      "/users",
      "/audit",
    ]);
  });
});
