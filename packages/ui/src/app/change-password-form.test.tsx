import { type ApiClient, ApiError, type User } from "@hrcc/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "../test/render";
import { ChangePasswordForm } from "./change-password-form";
import { ME_QUERY_KEY } from "./me-query";

const user: User = {
  id: "8f0f4b8e-4a52-4f7e-9a39-1d5f6c0e2a11",
  email: "omar.siddiqui@emirates.test",
  displayName: "Omar Siddiqui",
  role: "analyst",
  locale: "en",
  team: null,
  mustChangePassword: false,
};

function renderForm(changePassword: ApiClient["changePassword"]) {
  const queryClient = new QueryClient();
  const onChanged = vi.fn();
  renderWithI18n(
    <QueryClientProvider client={queryClient}>
      <ChangePasswordForm api={{ changePassword } as unknown as ApiClient} onChanged={onChanged} />
    </QueryClientProvider>,
  );
  return { queryClient, onChanged };
}

async function submit(current: string, next: string, confirm: string): Promise<void> {
  await userEvent.type(screen.getByLabelText("Current password"), current);
  await userEvent.type(screen.getByLabelText("New password"), next);
  await userEvent.type(screen.getByLabelText("Confirm new password"), confirm);
  await userEvent.click(screen.getByRole("button", { name: "Change password" }));
}

describe("ChangePasswordForm", () => {
  it("shows translated errors and sends nothing while the form is invalid", async () => {
    const changePassword = vi.fn();
    renderForm(changePassword);
    await submit("old-password-1", "short", "different");
    expect(await screen.findByText("Use at least 12 characters.")).toBeInTheDocument();
    expect(screen.getByText("The passwords don't match.")).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("explains a wrong current password from the API", async () => {
    const changePassword = vi
      .fn()
      .mockRejectedValue(new ApiError(400, { code: "wrong_password", params: {} }));
    renderForm(changePassword);
    await submit("old-password-1", "new-password-123", "new-password-123");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your current password isn't right.",
    );
  });

  it("saves the new password and updates the signed-in user", async () => {
    const changePassword = vi.fn().mockResolvedValue({ user });
    const { queryClient, onChanged } = renderForm(changePassword);
    await submit("old-password-1", "new-password-123", "new-password-123");
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(user));
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: "old-password-1",
      newPassword: "new-password-123",
    });
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toEqual(user);
  });
});
