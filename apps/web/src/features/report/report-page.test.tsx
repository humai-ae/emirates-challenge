import type { ApiClient, RunSummary } from "@hrcc/shared";
import { screen, waitFor, within } from "@testing-library/react";
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
    patterns: 0,
    findingPatterns: false,
    secondOpinionState: "off",
    secondOpinionTotal: 0,
    secondOpinionDone: 0,
    disagreements: 0,
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

  it("starts a run without a second opinion when unticked", async () => {
    const user = userEvent.setup();
    const api = {
      listRuns: vi.fn().mockResolvedValue({ runs: [] }),
      startRun: vi.fn().mockResolvedValue({ run: { ...RUN, rules: [] }, workedExamples: null }),
    } as unknown as ApiClient;
    renderInRouter(<ReportPage api={api} />);
    const ask = await screen.findByRole("checkbox", {
      name: "Ask AI for a second opinion on every transaction (takes a while)",
    });
    expect(ask).toBeChecked();
    const run = screen.getByRole("button", { name: "Run checks" });
    await user.click(run);
    await waitFor(() => expect(api.startRun).toHaveBeenLastCalledWith({ secondOpinion: true }));
    await waitFor(() => expect(run).toBeEnabled());
    await user.click(ask);
    await user.click(run);
    await waitFor(() => expect(api.startRun).toHaveBeenLastCalledWith({ secondOpinion: false }));
  });

  it("follows a second opinion, then links to the disagreements", async () => {
    const running = {
      ...RUN,
      totals: {
        ...RUN.totals,
        secondOpinionState: "running",
        secondOpinionTotal: 300,
        secondOpinionDone: 120,
      },
    };
    const api = {
      listRuns: vi.fn().mockResolvedValue({ runs: [running] }),
    } as unknown as ApiClient;
    const { unmount } = renderInRouter(<ReportPage api={api} />);
    expect(
      await screen.findByText("AI is giving a second opinion: 120 of 300 transactions read."),
    ).toBeInTheDocument();
    unmount();
    const done = {
      ...RUN,
      totals: {
        ...RUN.totals,
        secondOpinionState: "done",
        secondOpinionTotal: 300,
        secondOpinionDone: 300,
        disagreements: 7,
      },
    };
    vi.mocked(api.listRuns).mockResolvedValue({ runs: [done] } as never);
    renderInRouter(<ReportPage api={api} />);
    expect(
      await screen.findByText("AI strongly disagreed with the checks on 7 transactions."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the second opinions" })).toHaveAttribute(
      "href",
      "/analyst/second-opinions",
    );
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
