import type { User } from "@hrcc/shared";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderInRouter } from "../../test/render";
import { HomePage } from "./home-page";

function makeUser(role: User["role"], displayName: string, team: User["team"] = null): User {
  return {
    id: "8f0f4b8e-4a52-4f7e-9a39-1d5f6c0e2a11",
    email: "someone@emirates.test",
    displayName,
    role,
    locale: "en",
    team,
    mustChangePassword: false,
  };
}

describe("HomePage", () => {
  it("greets an analyst and links to each of their areas", async () => {
    renderInRouter(<HomePage user={makeUser("analyst", "Omar Siddiqui")} />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Welcome, Omar Siddiqui",
    );
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/analyst/report",
      "/analyst/inbox",
      "/analyst/fix-checks",
      "/analyst/second-opinions",
      "/analyst/requests",
    ]);
    expect(screen.getByRole("link", { name: /Exceptions inbox/ })).toHaveTextContent(
      "Exceptions waiting for your decision.",
    );
  });

  it("names a lead's team, in Arabic too", async () => {
    const team = {
      id: "3c4d5e6f-7a8b-4c3d-8e4f-5a6b7c8d9e0f",
      nameEn: "Payroll & Compensation",
      nameAr: "الرواتب والتعويضات",
    };
    renderInRouter(<HomePage user={makeUser("lead", "Priya Nair", team)} />, "ar");
    expect(await screen.findByText(/الرواتب والتعويضات/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /قائمة مهام فريقي/ })).toHaveAttribute(
      "href",
      "/lead/queue",
    );
  });
});
