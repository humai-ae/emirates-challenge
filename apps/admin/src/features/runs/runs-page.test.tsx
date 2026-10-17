import {
  type ApiClient,
  ApiError,
  type RulesListResponse,
  type RunsListResponse,
} from "@hrcc/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderInRouter } from "../../test/render";
import { APPROVED, DATASET, ruleOf, ruleVersion } from "../../test/rules";
import { RUN } from "../../test/runs";
import { RunsPage } from "./runs-page";

const LIVE: RulesListResponse = {
  dataset: DATASET,
  drafting: null,
  rules: [
    ruleOf([ruleVersion({ status: "active", ...APPROVED })]),
    ruleOf([ruleVersion()], { id: "R-02" }),
  ],
};

function makeApi(
  rules: RulesListResponse = LIVE,
  runs: RunsListResponse = { runs: [] },
  overrides: Record<string, unknown> = {},
) {
  return {
    listRules: vi.fn().mockResolvedValue(rules),
    listRuns: vi.fn().mockResolvedValue(runs),
    startRun: vi.fn().mockResolvedValue({ run: RUN, workedExamples: null, exportReady: false }),
    ...overrides,
  } as unknown as ApiClient;
}

describe("RunsPage", () => {
  it("asks for data, then a live rule, before a run", async () => {
    const { unmount } = renderInRouter(
      <RunsPage api={makeApi({ rules: [], dataset: null, drafting: null })} onStarted={vi.fn()} />,
    );
    expect(await screen.findByText(/Load data first\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Data" })).toHaveAttribute("href", "/data");
    expect(screen.getByRole("button", { name: "Run checks" })).toBeDisabled();
    unmount();
    renderInRouter(
      <RunsPage
        api={makeApi({ rules: [ruleOf([ruleVersion()])], dataset: DATASET, drafting: null })}
        onStarted={vi.fn()}
      />,
    );
    expect(await screen.findByText(/Approve at least one rule first\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Rules" })).toHaveAttribute("href", "/rules");
    expect(screen.getByRole("button", { name: "Run checks" })).toBeDisabled();
  });

  it("starts a run on the newest data and opens it", async () => {
    const user = userEvent.setup();
    const onStarted = vi.fn();
    const api = makeApi();
    renderInRouter(<RunsPage api={api} onStarted={onStarted} />);
    expect(
      await screen.findByText("Dataset: Training pack · transactions: 300 · live rules: 1"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Run checks" }));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(RUN));
    expect(api.startRun).toHaveBeenCalledTimes(1);
  });

  it("starts a run without a second opinion when unticked", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    renderInRouter(<RunsPage api={api} onStarted={vi.fn()} />);
    const ask = await screen.findByRole("checkbox", {
      name: "Ask AI for a second opinion on every transaction (takes a while)",
    });
    expect(ask).toBeChecked();
    await user.click(ask);
    await user.click(screen.getByRole("button", { name: "Run checks" }));
    await waitFor(() => expect(api.startRun).toHaveBeenCalledWith({ secondOpinion: false }));
  });

  it("lists runs with what they found", async () => {
    const { rules: _rules, ...summary } = RUN;
    renderInRouter(<RunsPage api={makeApi(LIVE, { runs: [summary] })} onStarted={vi.fn()} />);
    const rows = await screen.findAllByTestId("run-row");
    expect(rows).toHaveLength(1);
    const row = within(rows[0] as HTMLElement);
    expect(row.getByRole("link", { name: RUN.id })).toHaveAttribute("href", `/runs/${RUN.id}`);
    expect(rows[0]).toHaveTextContent("Training pack");
    expect(rows[0]).toHaveTextContent("15");
    expect(row.getByText("Complete")).toBeInTheDocument();
  });

  it("explains a refused run", async () => {
    const user = userEvent.setup();
    const api = makeApi(
      LIVE,
      { runs: [] },
      {
        startRun: vi
          .fn()
          .mockRejectedValue(new ApiError(409, { code: "run_in_progress", params: {} })),
      },
    );
    renderInRouter(<RunsPage api={api} onStarted={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Run checks" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A run is already in progress. Wait for it to finish, then try again.",
    );
  });
});
