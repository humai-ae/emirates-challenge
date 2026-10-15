import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "../test/render";
import { AppShell } from "./app-shell";

const user = {
  displayName: "Priya Nair",
  role: "lead" as const,
  teamName: "Payroll & Compensation",
};

describe("AppShell", () => {
  it("shows the product, the synthetic-data banner, the user, their role and the account link", () => {
    renderWithI18n(
      <AppShell
        user={user}
        nav={<a href="/lead/queue">Queue</a>}
        locale="en"
        onLocaleChange={() => undefined}
        account={<a href="/account/password">Change password</a>}
        onSignOut={() => undefined}
      >
        <p>content</p>
      </AppShell>,
    );
    expect(screen.getByText("HR Compliance Checker")).toBeInTheDocument();
    expect(screen.getByTestId("synthetic-banner")).toHaveTextContent("Synthetic data only");
    expect(screen.getByTestId("who")).toHaveTextContent(
      "Priya Nair · Ops team lead, Payroll & Compensation",
    );
    expect(screen.getByRole("navigation", { name: "Main" })).toContainElement(
      screen.getByRole("link", { name: "Queue" }),
    );
    expect(screen.getByRole("link", { name: "Change password" })).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("labels the sign-out button in Arabic and calls the handler", async () => {
    const onSignOut = vi.fn();
    renderWithI18n(
      <AppShell
        user={user}
        nav={null}
        locale="ar"
        onLocaleChange={() => undefined}
        onSignOut={onSignOut}
      >
        <p>محتوى</p>
      </AppShell>,
      "ar",
    );
    expect(screen.getByTestId("who")).toHaveTextContent("قائد فريق العمليات");
    await userEvent.click(screen.getByRole("button", { name: "تسجيل الخروج" }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
