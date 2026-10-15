import { type ApiClient, ApiError, type ManagedUser, type User } from "@hrcc/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/render";
import { UsersPage } from "./users-page";

const layla: ManagedUser = {
  id: "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d",
  email: "layla.haddad@emirates.test",
  displayName: "Layla Haddad",
  role: "admin",
  locale: "en",
  team: null,
  mustChangePassword: false,
  isActive: true,
  isDemo: true,
  createdAt: "2026-10-15T08:00:00.000Z",
};
const omar: ManagedUser = {
  ...layla,
  id: "2b3c4d5e-6f7a-4b2c-9d3e-4f5a6b7c8d9e",
  email: "omar.siddiqui@emirates.test",
  displayName: "Omar Siddiqui",
  role: "analyst",
};
const sara: ManagedUser = {
  ...layla,
  id: "3c4d5e6f-7a8b-4c3d-8e4f-5a6b7c8d9e0f",
  email: "sara.ali@emirates.test",
  displayName: "Sara Ali",
  role: "analyst",
  isActive: false,
  isDemo: false,
  mustChangePassword: true,
};
const currentUser: User = {
  id: layla.id,
  email: layla.email,
  displayName: layla.displayName,
  role: "admin",
  locale: "en",
  team: null,
  mustChangePassword: false,
};
const onboarding = {
  id: "4d5e6f7a-8b9c-4d0e-9f1a-2b3c4d5e6f7a",
  nameEn: "Onboarding",
  nameAr: "تهيئة الموظفين الجدد",
};

function makeApi(overrides: Record<string, unknown> = {}) {
  return {
    listUsers: vi.fn().mockResolvedValue({ users: [layla, omar, sara] }),
    listTeams: vi.fn().mockResolvedValue({ teams: [onboarding] }),
    createUser: vi.fn(),
    deactivateUser: vi.fn(),
    reactivateUser: vi.fn(),
    resetUserPassword: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

async function fillNewUser(role: string): Promise<void> {
  await userEvent.click(await screen.findByRole("button", { name: "Add user" }));
  await userEvent.type(screen.getByLabelText("Full name"), "New Person");
  await userEvent.type(screen.getByLabelText("Work email"), "new.person@emirates.test");
  await userEvent.selectOptions(screen.getByLabelText("Role"), role);
  await userEvent.type(screen.getByLabelText("Temporary password"), "temporary-pass-1");
}

describe("UsersPage", () => {
  it("lists users with their status, and offers no actions on your own account", async () => {
    renderWithProviders(<UsersPage api={makeApi()} currentUser={currentUser} />);
    const rows = await screen.findAllByTestId("user-row");
    expect(rows).toHaveLength(3);
    expect(within(rows[0] as HTMLElement).getByText("You")).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).queryByRole("button")).not.toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText("Deactivated")).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText("Must change password")).toBeInTheDocument();
    expect(
      within(rows[2] as HTMLElement).getByRole("button", { name: "Reactivate" }),
    ).toBeInTheDocument();
  });

  it("adds a user, asking for a team only for team leads", async () => {
    const created: ManagedUser = {
      ...sara,
      email: "new.person@emirates.test",
      displayName: "New Person",
      role: "lead",
      isActive: true,
    };
    const api = makeApi({ createUser: vi.fn().mockResolvedValue({ user: created }) });
    renderWithProviders(<UsersPage api={api} currentUser={currentUser} />);
    await fillNewUser("lead");
    await userEvent.click(screen.getByRole("button", { name: "Add user" }));
    expect(await screen.findByText("Choose the team this lead runs.")).toBeInTheDocument();
    expect(api.createUser).not.toHaveBeenCalled();
    await userEvent.selectOptions(screen.getByLabelText("Team"), onboarding.id);
    await userEvent.click(screen.getByRole("button", { name: "Add user" }));
    await vi.waitFor(() =>
      expect(api.createUser).toHaveBeenCalledWith({
        displayName: "New Person",
        email: "new.person@emirates.test",
        role: "lead",
        teamId: onboarding.id,
        locale: "en",
        password: "temporary-pass-1",
      }),
    );
    expect(
      await screen.findByText(
        "new.person@emirates.test can now sign in with the temporary password.",
      ),
    ).toBeInTheDocument();
  });

  it("explains why the API refused a new user", async () => {
    const api = makeApi({
      createUser: vi.fn().mockRejectedValue(new ApiError(409, { code: "email_taken", params: {} })),
    });
    renderWithProviders(<UsersPage api={api} currentUser={currentUser} />);
    await fillNewUser("analyst");
    await userEvent.click(screen.getByRole("button", { name: "Add user" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An account with this email already exists.",
    );
  });

  it("deactivates a user after confirmation and refreshes the list", async () => {
    const api = makeApi({
      deactivateUser: vi.fn().mockResolvedValue({ user: { ...omar, isActive: false } }),
    });
    renderWithProviders(<UsersPage api={api} currentUser={currentUser} />);
    const rows = await screen.findAllByTestId("user-row");
    await userEvent.click(
      within(rows[1] as HTMLElement).getByRole("button", { name: "Deactivate" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Deactivate Omar Siddiqui?");
    await userEvent.click(within(dialog).getByRole("button", { name: "Deactivate" }));
    await vi.waitFor(() => expect(api.deactivateUser).toHaveBeenCalledWith(omar.id));
    await vi.waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await vi.waitFor(() => expect(api.listUsers).toHaveBeenCalledTimes(2));
  });

  it("resets a password with a new temporary one", async () => {
    const api = makeApi({
      resetUserPassword: vi.fn().mockResolvedValue({ user: { ...omar, mustChangePassword: true } }),
    });
    renderWithProviders(<UsersPage api={api} currentUser={currentUser} />);
    const rows = await screen.findAllByTestId("user-row");
    await userEvent.click(
      within(rows[1] as HTMLElement).getByRole("button", { name: "Reset password" }),
    );
    const dialog = await screen.findByRole("dialog");
    const field = within(dialog).getByLabelText("New temporary password");
    await userEvent.type(field, "short");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reset password" }));
    expect(await within(dialog).findByText("Use at least 12 characters.")).toBeInTheDocument();
    await userEvent.clear(field);
    await userEvent.type(field, "reset-password-1");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reset password" }));
    await vi.waitFor(() =>
      expect(api.resetUserPassword).toHaveBeenCalledWith(omar.id, { password: "reset-password-1" }),
    );
  });
});
