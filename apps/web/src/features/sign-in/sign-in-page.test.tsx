import { type ApiClient, ApiError } from "@hrcc/shared";
import { AppProviders, createAppI18n } from "@hrcc/ui/app";
import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { resources } from "../../i18n";
import { SignInPage } from "./sign-in-page";

const demoUsers = {
  users: [
    {
      id: "0b8f1f3e-5c2a-4d4b-9e7a-6f1c2d3e4a5b",
      displayName: "Daniel Mensah",
      role: "auditor",
      team: null,
    },
    {
      id: "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d",
      displayName: "Layla Haddad",
      role: "admin",
      team: null,
    },
    {
      id: "2b3c4d5e-6f7a-4b2c-9d3e-4f5a6b7c8d9e",
      displayName: "Priya Nair",
      role: "lead",
      team: {
        id: "3c4d5e6f-7a8b-4c3d-8e4f-5a6b7c8d9e0f",
        nameEn: "Payroll & Compensation",
        nameAr: "الرواتب والتعويضات",
      },
    },
  ],
};

function renderPage(
  api: ApiClient,
  onSignIn = vi.fn().mockResolvedValue(undefined),
  locale: "en" | "ar" = "en",
) {
  const i18n = createAppI18n(resources, locale);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <AppProviders i18n={i18n} queryClient={queryClient}>
      <SignInPage api={api} onSignIn={onSignIn} />
    </AppProviders>,
  );
  return { onSignIn };
}

describe("SignInPage", () => {
  it("lists demo users by role, admin first", async () => {
    const api = { getDemoUsers: vi.fn().mockResolvedValue(demoUsers) } as unknown as ApiClient;
    renderPage(api);
    const buttons = await screen.findAllByRole("button", { name: /Continue as/ });
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Continue as Layla Haddad",
      "Continue as Priya Nair",
      "Continue as Daniel Mensah",
    ]);
    expect(screen.getByText("Payroll & Compensation")).toBeInTheDocument();
  });

  it("signs in as the chosen user", async () => {
    const api = { getDemoUsers: vi.fn().mockResolvedValue(demoUsers) } as unknown as ApiClient;
    const { onSignIn } = renderPage(api);
    await userEvent.click(await screen.findByRole("button", { name: "Continue as Priya Nair" }));
    expect(onSignIn).toHaveBeenCalledWith("2b3c4d5e-6f7a-4b2c-9d3e-4f5a6b7c8d9e");
  });

  it("shows team names in Arabic", async () => {
    const api = { getDemoUsers: vi.fn().mockResolvedValue(demoUsers) } as unknown as ApiClient;
    renderPage(api, undefined, "ar");
    expect(await screen.findByText("الرواتب والتعويضات")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("من أنت؟");
  });

  it("explains when demo sign-in is turned off", async () => {
    const api = {
      getDemoUsers: vi
        .fn()
        .mockRejectedValue(new ApiError(403, { code: "demo_auth_disabled", params: {} })),
    } as unknown as ApiClient;
    renderPage(api);
    expect(
      await screen.findByText("Demo sign-in is turned off. Use your organisation's sign-in."),
    ).toBeInTheDocument();
  });
});
