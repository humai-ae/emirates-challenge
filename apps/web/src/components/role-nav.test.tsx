import type { Role } from "@hrcc/shared";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderInRouter } from "../test/render";
import { RoleNav } from "./role-nav";

// Named, so the a11y lint does not read a literal `role` prop as an ARIA role.
const analyst: Role = "analyst";
const lead: Role = "lead";

describe("RoleNav", () => {
  it("shows how many flags wait in the inbox and the fix checks", async () => {
    renderInRouter(
      <RoleNav role={analyst} counts={{ inbox: 12, fixChecks: 1, queue: null, notices: 0 }} />,
    );
    expect(
      await screen.findByRole("link", { name: /^Exceptions inbox\s*12$/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Fix checks\s*1$/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Daily report" })).toBeInTheDocument();
  });

  it("shows a lead their queue's count, and no badge when it is empty", async () => {
    const { unmount } = renderInRouter(
      <RoleNav role={lead} counts={{ inbox: null, fixChecks: null, queue: 3, notices: 0 }} />,
    );
    expect(await screen.findByRole("link", { name: /^My team queue\s*3$/ })).toBeInTheDocument();
    unmount();
    renderInRouter(
      <RoleNav role={lead} counts={{ inbox: null, fixChecks: null, queue: 0, notices: 0 }} />,
    );
    expect(await screen.findByRole("link", { name: "My team queue" })).toBeInTheDocument();
  });
});
