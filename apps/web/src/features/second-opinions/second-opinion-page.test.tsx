import { type ApiClient, ApiError } from "@hrcc/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderInRouter } from "../../test/render";
import { secondOpinionDetail } from "../../test/second-opinions";
import { SecondOpinionPage } from "./second-opinion-page";

const NOTED = { by: "Omar Siddiqui", at: "2026-10-17T09:00:00.000Z" };

describe("SecondOpinionPage", () => {
  it("shows the rule, the transaction and AI's view", async () => {
    const opinion = secondOpinionDetail({ code: "flagged", pBreak: 0.04, flagId: "F-000002" });
    const api = {
      getSecondOpinion: vi.fn().mockResolvedValue({ opinion }),
    } as unknown as ApiClient;
    renderInRouter(<SecondOpinionPage api={api} opinionId={opinion.id} />);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "R-02 · Requester is not the approver",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("A second opinion from AI: it never changes a finding."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("opinion-rule")).toHaveTextContent(
      "The person who requests a transaction must not approve it.",
    );
    const view = screen.getByTestId("opinion-view");
    expect(view).toHaveTextContent("The check flagged it");
    expect(view).toHaveTextContent("AI: 4% likely it breaks the rule as the policy writes it");
    expect(view).toHaveTextContent("AI had enough to judge: 90%");
    expect(within(view).getByRole("link", { name: "Open the flag F-000002" })).toHaveAttribute(
      "href",
      "/analyst/flags/F-000002",
    );
    const cells = within(screen.getByTestId("opinion-transaction"));
    expect(cells.getAllByRole("term").map((term) => term.textContent)).toEqual([
      "transaction_id",
      "requester_id",
      "approver_1_id",
    ]);
    expect(cells.getAllByRole("definition").map((value) => value.textContent)).toEqual([
      "TX-000041",
      "E-0007",
      "E-0007",
    ]);
  });

  it("says when the dataset is gone", async () => {
    const opinion = secondOpinionDetail({ transaction: [] });
    const api = {
      getSecondOpinion: vi.fn().mockResolvedValue({ opinion }),
    } as unknown as ApiClient;
    renderInRouter(<SecondOpinionPage api={api} opinionId={opinion.id} />);
    expect(
      await screen.findByText("The dataset has been deleted, so the transaction's cells are gone."),
    ).toBeInTheDocument();
  });

  it("marks noted, and asks for a rule review", async () => {
    const user = userEvent.setup();
    const opinion = secondOpinionDetail();
    const api = {
      getSecondOpinion: vi.fn().mockResolvedValue({ opinion }),
      noteSecondOpinion: vi.fn().mockResolvedValue({ opinion: { ...opinion, noted: NOTED } }),
      askRuleReview: vi.fn().mockResolvedValue({
        opinion: { ...opinion, noted: NOTED, reviewRequested: NOTED },
      }),
    } as unknown as ApiClient;
    renderInRouter(<SecondOpinionPage api={api} opinionId={opinion.id} />);
    await user.click(await screen.findByRole("button", { name: "Mark noted" }));
    expect(api.noteSecondOpinion).toHaveBeenCalledWith(opinion.id);
    expect(await screen.findByText(/Noted by Omar Siddiqui/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark noted" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Ask for a rule review" }));
    expect(api.askRuleReview).toHaveBeenCalledWith(opinion.id);
    expect(await screen.findByText(/Review asked for by Omar Siddiqui/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask for a rule review" })).toBeDisabled();
  });

  it("says why an action didn't go through", async () => {
    const user = userEvent.setup();
    const opinion = secondOpinionDetail();
    const api = {
      getSecondOpinion: vi.fn().mockResolvedValue({ opinion }),
      noteSecondOpinion: vi
        .fn()
        .mockRejectedValue(new ApiError(409, { code: "opinion_already_noted", params: {} })),
    } as unknown as ApiClient;
    renderInRouter(<SecondOpinionPage api={api} opinionId={opinion.id} />);
    await user.click(await screen.findByRole("button", { name: "Mark noted" }));
    expect(
      await screen.findByText(
        "Someone has already marked this second opinion noted. Reload the page.",
      ),
    ).toBeInTheDocument();
  });
});
