import type { ApiClient, FlagDetail } from "@hrcc/shared";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { flagDetail } from "../../test/flags";
import { renderInRouter } from "../../test/render";
import { FlagPage } from "./flag-page";

const PRIYA = { id: "6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d", displayName: "Priya Nair" };

function makeApi(flag: FlagDetail) {
  return {
    getFlag: vi.fn().mockResolvedValue({ flag }),
    assignFlag: vi.fn().mockResolvedValue({
      flag: { ...flag, status: "being_fixed", assignee: "Priya Nair", allowed: ["assign", "fix"] },
    }),
    fixFlag: vi.fn().mockResolvedValue({
      flag: { ...flag, status: "fix_submitted", allowed: [] },
    }),
  } as unknown as ApiClient;
}

describe("the lead's actions on a flag", () => {
  it("starts the fix with someone from the team", async () => {
    const user = userEvent.setup();
    const api = makeApi(
      flagDetail({ status: "confirmed", allowed: ["assign"], assignees: [PRIYA], rowVersion: 2 }),
    );
    renderInRouter(<FlagPage api={api} flagId="F-000001" reader="lead" />);
    expect(await screen.findByLabelText("Who will fix it?")).toHaveValue(PRIYA.id);
    await user.click(screen.getByRole("button", { name: "Start fixing" }));
    expect(api.assignFlag).toHaveBeenCalledWith("F-000001", {
      rowVersion: 2,
      assigneeId: PRIYA.id,
    });
    expect(await screen.findByText("Priya Nair is fixing it.")).toBeInTheDocument();
  });

  it("records what was done, and asks for it", async () => {
    const user = userEvent.setup();
    const api = makeApi(
      flagDetail({
        status: "being_fixed",
        allowed: ["assign", "fix"],
        assignees: [PRIYA],
        assignee: "Priya Nair",
        rowVersion: 3,
      }),
    );
    renderInRouter(<FlagPage api={api} flagId="F-000001" reader="lead" />);
    await user.click(await screen.findByRole("button", { name: "Mark fixed" }));
    expect(await screen.findByText("Choose what was done.")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Retrospective approval obtained"));
    await user.type(screen.getByLabelText("Details"), "A grade 12 approver signed off.");
    await user.click(screen.getByRole("button", { name: "Mark fixed" }));
    expect(api.fixFlag).toHaveBeenCalledWith("F-000001", {
      rowVersion: 3,
      fixType: "retrospective_approval",
      note: "A grade 12 approver signed off.",
    });
  });

  it("waits for the analyst once it is marked fixed", async () => {
    renderInRouter(
      <FlagPage
        api={makeApi(flagDetail({ status: "fix_submitted", allowed: [] }))}
        flagId="F-000001"
        reader="lead"
      />,
    );
    expect(
      await screen.findByText(
        "Marked fixed. Waiting for the compliance analyst to check and close it.",
      ),
    ).toBeInTheDocument();
  });
});
