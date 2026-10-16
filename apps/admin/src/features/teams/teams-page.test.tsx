import type { ApiClient, RoutingResponse, TeamsListResponse } from "@hrcc/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderInRouter } from "../../test/render";
import { TeamsPage } from "./teams-page";

const PAYROLL = {
  id: "0f8c6a2e-1b4d-4e5f-8a9b-1c2d3e4f5a6b",
  nameEn: "Payroll & Compensation",
  nameAr: "الرواتب والتعويضات",
};
const ONBOARDING = {
  id: "1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d",
  nameEn: "Onboarding",
  nameAr: null,
};
const TEAMS: TeamsListResponse = { teams: [ONBOARDING, PAYROLL] };
const ROUTING: RoutingResponse = {
  rows: [
    {
      type: "allowance_change",
      team: PAYROLL,
      setBy: "Layla Haddad",
      setAt: "2026-10-16T09:00:00.000Z",
    },
    { type: "exit", team: null, setBy: null, setAt: null },
  ],
  policyOwners: [],
};

function makeApi(overrides: Record<string, unknown> = {}) {
  return {
    getRouting: vi.fn().mockResolvedValue(ROUTING),
    listTeams: vi.fn().mockResolvedValue(TEAMS),
    saveRouting: vi.fn().mockResolvedValue(ROUTING),
    proposeRouting: vi.fn(),
    createTeam: vi.fn().mockResolvedValue({ team: { id: "2b", nameEn: "Exits", nameAr: null } }),
    updateTeam: vi.fn().mockResolvedValue({ team: ONBOARDING }),
    ...overrides,
  } as unknown as ApiClient;
}

describe("TeamsPage", () => {
  it("lists each transaction type with its owner team, and saves the owners chosen", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    renderInRouter(<TeamsPage api={api} />);
    const exit = await screen.findByLabelText("Owner team for exit");
    expect(screen.getByLabelText("Owner team for allowance_change")).toHaveValue(
      "Payroll & Compensation",
    );
    expect(screen.getByRole("button", { name: "Save owners" })).toBeDisabled();
    await user.selectOptions(exit, "Onboarding");
    await user.click(screen.getByRole("button", { name: "Save owners" }));
    expect(api.saveRouting).toHaveBeenCalledWith({
      rows: [
        { type: "allowance_change", teamName: "Payroll & Compensation" },
        { type: "exit", teamName: "Onboarding" },
      ],
    });
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("fills in what the policy and AI suggest, as new teams where needed", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      proposeRouting: vi.fn().mockResolvedValue({
        proposals: [
          {
            type: "allowance_change",
            team: "payroll & compensation",
            source: "policy",
            confidence: null,
          },
          { type: "exit", team: "Employee Services", source: "ai", confidence: 0.82 },
        ],
        unassigned: [],
      }),
    });
    renderInRouter(<TeamsPage api={api} />);
    await user.click(await screen.findByRole("button", { name: "Suggest owners" }));
    const rows = await screen.findAllByTestId("routing-row");
    expect(within(rows[0] as HTMLElement).getByText("From the policy")).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("AI suggests (82% sure)")).toBeInTheDocument();
    // A suggestion naming an existing team, in any case, selects that team.
    expect(screen.getByLabelText("Owner team for allowance_change")).toHaveValue(
      "Payroll & Compensation",
    );
    expect(screen.getByLabelText("Owner team for exit")).toHaveValue("Employee Services");
    // Every row can choose the proposed new team.
    expect(screen.getAllByRole("option", { name: "Employee Services (new team)" })).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Save owners" }));
    expect(api.saveRouting).toHaveBeenCalledWith({
      rows: [
        { type: "allowance_change", teamName: "Payroll & Compensation" },
        { type: "exit", teamName: "Employee Services" },
      ],
    });
  });

  it("adds a team, and gives one its Arabic name", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    renderInRouter(<TeamsPage api={api} />);
    await user.click(await screen.findByRole("button", { name: "Add a team" }));
    await user.type(screen.getByLabelText("Name in English"), "Exits");
    await user.click(screen.getByRole("button", { name: "Save team" }));
    expect(api.createTeam).toHaveBeenCalledWith({ nameEn: "Exits", nameAr: "" });
    await waitFor(() => expect(screen.queryByLabelText("Name in English")).not.toBeInTheDocument());
    const onboarding = screen.getAllByTestId("team-row")[0] as HTMLElement;
    expect(within(onboarding).getByText("No Arabic name yet")).toBeInTheDocument();
    await user.click(within(onboarding).getByRole("button", { name: "Edit" }));
    await user.type(within(onboarding).getByLabelText("Name in Arabic"), "تهيئة الموظفين الجدد");
    await user.click(within(onboarding).getByRole("button", { name: "Save team" }));
    expect(api.updateTeam).toHaveBeenCalledWith(ONBOARDING.id, {
      nameEn: "Onboarding",
      nameAr: "تهيئة الموظفين الجدد",
    });
  });
});
