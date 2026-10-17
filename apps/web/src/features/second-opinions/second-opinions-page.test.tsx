import type { ApiClient } from "@hrcc/shared";
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderInRouter } from "../../test/render";
import { PASSED_OPINION, secondOpinion } from "../../test/second-opinions";
import { SecondOpinionsPage } from "./second-opinions-page";

describe("SecondOpinionsPage", () => {
  it("lists the strongest disagreements, and opens one", async () => {
    const noted = secondOpinion({
      id: "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
      ruleId: "R-01",
      ruleTitle: "Approval of large allowance changes",
      transactionId: "TX-000006",
      rowNo: 6,
      code: "flagged",
      pBreak: 0.08,
      strength: 0.92,
      noted: { by: "Omar Siddiqui", at: "2026-10-17T09:00:00.000Z" },
      flagId: "F-000001",
    });
    const api = {
      listSecondOpinions: vi.fn().mockResolvedValue({
        runId: "RUN-2026-10-17-01",
        opinions: [PASSED_OPINION, noted],
        total: 120,
      }),
    } as unknown as ApiClient;
    renderInRouter(<SecondOpinionsPage api={api} />);
    expect(
      await screen.findByText("RUN-2026-10-17-01: AI strongly disagreed on 120. The 2 strongest:"),
    ).toBeInTheDocument();
    const [first, second] = screen.getAllByTestId("second-opinion");
    if (!first || !second) throw new Error("two rows");
    expect(first).toHaveTextContent("R-02 · Requester is not the approver");
    expect(first).toHaveTextContent("The check passed it");
    expect(first).toHaveTextContent("AI: 95% likely it breaks the rule");
    expect(first).toHaveTextContent("How strongly AI disagrees: 95%");
    expect(first).toHaveTextContent("TX-000041 · row 41");
    expect(within(first).getByRole("link")).toHaveAttribute(
      "href",
      `/analyst/second-opinions/${PASSED_OPINION.id}`,
    );
    expect(first).not.toHaveAttribute("data-noted");
    expect(second).toHaveTextContent("The check flagged it");
    expect(second).toHaveTextContent("AI: 8% likely it breaks the rule");
    expect(second).toHaveTextContent("Noted by Omar Siddiqui");
    expect(second).toHaveAttribute("data-noted", "true");
  });

  it("says when there are none", async () => {
    const api = {
      listSecondOpinions: vi.fn().mockResolvedValue({ runId: null, opinions: [], total: 0 }),
    } as unknown as ApiClient;
    renderInRouter(<SecondOpinionsPage api={api} />);
    expect(await screen.findByText("No second opinions yet")).toBeInTheDocument();
  });
});
