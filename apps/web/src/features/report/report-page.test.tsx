import type { ApiClient, RunSummary } from "@hrcc/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderInRouter } from "../../test/render";
import { ReportPage } from "./report-page";

const RUN: RunSummary = {
  id: "RUN-2026-10-16-01",
  status: "complete",
  dataset: { id: "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b", name: "Training pack" },
  startedAt: "2026-10-16T08:00:00.000Z",
  startedBy: "Omar Siddiqui",
  finishedAt: "2026-10-16T08:00:01.000Z",
  totals: {
    transactions: 300,
    findings: 13,
    couldNotCheck: 2,
    waitingForAi: 0,
    durationMs: 900,
    newFlags: 11,
    seenAgain: 2,
    aiFailed: 0,
  },
};

describe("ReportPage", () => {
  it("summarises the latest check and links to the inbox", async () => {
    const api = { listRuns: vi.fn().mockResolvedValue({ runs: [RUN] }) } as unknown as ApiClient;
    renderInRouter(<ReportPage api={api} />);
    expect(await screen.findByText("Latest check: RUN-2026-10-16-01")).toBeInTheDocument();
    const totals = screen.getAllByTestId("report-total");
    expect(totals.map((total) => total.textContent)).toEqual([
      "Transactions checked300",
      "Rule breaks found13",
      "New flags11",
      "Found again2",
      "Could not check2",
      "Waiting for AI0",
    ]);
    expect(screen.getByRole("link", { name: "Go to the inbox" })).toHaveAttribute(
      "href",
      "/analyst/inbox",
    );
  });

  it("runs the checks, and says why when it can't", async () => {
    const user = userEvent.setup();
    const { ApiError } = await import("@hrcc/shared");
    const api = {
      listRuns: vi.fn().mockResolvedValue({ runs: [] }),
      startRun: vi.fn().mockRejectedValue(new ApiError(409, { code: "no_live_rules", params: {} })),
    } as unknown as ApiClient;
    renderInRouter(<ReportPage api={api} />);
    expect(await screen.findByText("No check has run yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Run checks" }));
    expect(
      await screen.findByText("Approve at least one rule before running checks."),
    ).toBeInTheDocument();
  });

  it("shows AI checks waiting and failed, and retries the failed ones", async () => {
    const user = userEvent.setup();
    const failed = { ...RUN, totals: { ...RUN.totals, waitingForAi: 3, aiFailed: 2 } };
    const api = {
      listRuns: vi.fn().mockResolvedValue({ runs: [failed] }),
      retryAiChecks: vi.fn().mockResolvedValue({
        run: { ...failed, rules: [] },
        workedExamples: null,
        exportReady: false,
      }),
    } as unknown as ApiClient;
    renderInRouter(<ReportPage api={api} />);
    expect(
      await screen.findByText(
        "Waiting for AI: 3 transactions. Their flags appear when AI is done.",
      ),
    ).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    await user.click(within(alert).getByRole("button", { name: "Retry AI checks" }));
    expect(api.retryAiChecks).toHaveBeenCalledWith("RUN-2026-10-16-01");
  });
});
