import { ApiError } from "@hrcc/shared";
import { AppProviders, createAppI18n } from "@hrcc/ui/app";
import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { resources } from "../../i18n";
import { SignInPage } from "./sign-in-page";

function renderPage(onSignIn = vi.fn().mockResolvedValue(undefined), locale: "en" | "ar" = "en") {
  const i18n = createAppI18n(resources, locale);
  render(
    <AppProviders i18n={i18n} queryClient={new QueryClient()}>
      <SignInPage onSignIn={onSignIn} />
    </AppProviders>,
  );
  return { onSignIn };
}

describe("SignInPage", () => {
  it("asks for an email and a password and lists no users", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sign in");
    expect(screen.getByLabelText("Work email")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.queryByText(/Continue as/)).not.toBeInTheDocument();
    expect(screen.getByTestId("synthetic-banner")).toBeInTheDocument();
  });

  it("checks the form before sending it", async () => {
    const { onSignIn } = renderPage();
    await userEvent.type(screen.getByLabelText("Work email"), "layla");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Fill in this field.")).toBeInTheDocument();
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it("signs in with the email and the password", async () => {
    const { onSignIn } = renderPage();
    await userEvent.type(screen.getByLabelText("Work email"), "layla.haddad@emirates.test");
    await userEvent.type(screen.getByLabelText("Password"), "a-password-123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await vi.waitFor(() =>
      expect(onSignIn).toHaveBeenCalledWith({
        email: "layla.haddad@emirates.test",
        password: "a-password-123",
      }),
    );
  });

  it("says when the email and password don't match", async () => {
    renderPage(
      vi.fn().mockRejectedValue(new ApiError(401, { code: "invalid_credentials", params: {} })),
    );
    await userEvent.type(screen.getByLabelText("Work email"), "layla.haddad@emirates.test");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That email and password don't match an active account.",
    );
  });

  it("is fully in Arabic", () => {
    renderPage(undefined, "ar");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("تسجيل الدخول");
    expect(screen.getByLabelText("البريد الإلكتروني للعمل")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تسجيل الدخول" })).toBeInTheDocument();
  });
});
