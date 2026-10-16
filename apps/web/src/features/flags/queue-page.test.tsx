import type { ApiClient, QueueResponse } from "@hrcc/shared";
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { flagSummary, PAYROLL } from "../../test/flags";
import { renderInRouter } from "../../test/render";
import { QueuePage } from "./queue-page";

const queue = (overrides: Partial<QueueResponse> = {}): QueueResponse => ({
  team: PAYROLL,
  sentBack: [
    flagSummary({
      id: "F-000002",
      status: "being_fixed",
      assignee: "Priya Nair",
      sentBack: {
        reason: "The sign-off has no date.",
        by: "Omar Siddiqui",
        byId: "u-omar",
        at: "2026-10-17T10:00:00.000Z",
      },
    }),
  ],
  toFix: [flagSummary({ status: "confirmed", overdue: true })],
  waiting: [],
  closed: [flagSummary({ id: "F-000005", status: "closed" })],
  ...overrides,
});

describe("QueuePage", () => {
  it("puts what was sent back first, then what is to fix, with links to each flag", async () => {
    const api = { getQueue: vi.fn().mockResolvedValue(queue()) } as unknown as ApiClient;
    renderInRouter(<QueuePage api={api} />);
    expect(
      await screen.findByText(/Payroll & Compensation · 2 to fix · 1 overdue/),
    ).toBeInTheDocument();
    const sentBack = screen.getByRole("region", { name: "Sent back to you" });
    expect(sentBack).toHaveTextContent("Sent back by Omar Siddiqui: The sign-off has no date.");
    const toFix = screen.getByRole("region", { name: "To fix" });
    expect(within(toFix).getByRole("link", { name: /R-01/ })).toHaveAttribute(
      "href",
      "/lead/flags/F-000001",
    );
    expect(toFix).toHaveTextContent("Overdue");
    expect(screen.getByRole("region", { name: "Recently closed (1)" })).toBeInTheDocument();
  });

  it("says when there is nothing to fix", async () => {
    const api = {
      getQueue: vi.fn().mockResolvedValue(queue({ sentBack: [], toFix: [], closed: [] })),
    } as unknown as ApiClient;
    renderInRouter(<QueuePage api={api} />);
    expect(await screen.findByText("Nothing to fix")).toBeInTheDocument();
    expect(
      screen.getByText("Confirmed issues for Payroll & Compensation will appear here."),
    ).toBeInTheDocument();
  });
});
