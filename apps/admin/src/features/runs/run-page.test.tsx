import type { ApiClient, RunResponse } from "@hrcc/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderInRouter } from "../../test/render";
import { FINDING, RUN, UNCHECKED } from "../../test/runs";
import { RunPage } from "./run-page";

function makeApi(response: RunResponse, overrides: Record<string, unknown> = {}) {
  return {
    getRun: vi.fn().mockResolvedValue(response),
    listRunResults: vi.fn().mockResolvedValue({ results: [], nextAfter: null }),
    runExportUrl: (id: string) => `/api/v1/runs/${id}/export`,
    ...overrides,
  } as unknown as ApiClient;
}

const response = (overrides: Partial<RunResponse> = {}): RunResponse => ({
  run: RUN,
  workedExamples: null,
  exportReady: false,
  ...overrides,
});

describe("RunPage", () => {
  it("shows the run's totals and each rule's counts", async () => {
    renderInRouter(<RunPage api={makeApi(response())} runId={RUN.id} />);
    expect(await screen.findByRole("heading", { level: 1, name: RUN.id })).toBeInTheDocument();
    expect(
      screen.getByText(/^Training pack · started .* by Layla Haddad · took 0\.4 s$/),
    ).toBeInTheDocument();
    const totals = screen.getAllByTestId("run-total");
    expect(totals[1]).toHaveTextContent("Findings15");
    expect(totals[2]).toHaveTextContent("Could not check2");
    expect(totals[4]).toHaveTextContent("New flags0");
    expect(totals[5]).toHaveTextContent("Found again0");
    const rules = screen.getAllByTestId("run-rule");
    expect(rules).toHaveLength(2);
    expect(rules[0]).toHaveTextContent("R-01");
    expect(rules[0]).toHaveTextContent("Approval of large allowance changes");
    expect(rules[1]).toHaveTextContent("8");
    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Download findings (CSV)" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Set up the finding format" })[0]).toHaveAttribute(
      "href",
      "/finding-format",
    );
  });

  it("says which rules couldn't run on the dataset", async () => {
    const [first, second] = RUN.rules;
    const run = {
      ...RUN,
      status: "complete_with_errors" as const,
      rules: [
        { ...first, error: "The check can't run: unknown_field approvers[].grade" },
        second,
      ].filter((rule) => rule !== undefined),
    };
    renderInRouter(<RunPage api={makeApi(response({ run }))} runId={RUN.id} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Some rules couldn't run on this dataset",
    );
    expect(screen.getAllByTestId("run-rule")[0]).toHaveTextContent(
      "Couldn't run: The check can't run: unknown_field approvers[].grade",
    );
    expect(screen.getByText("Some rules couldn't run")).toBeInTheDocument();
  });

  it("lists findings with their explanation and evidence, then more", async () => {
    const user = userEvent.setup();
    const api = makeApi(response(), {
      listRunResults: vi
        .fn()
        .mockResolvedValueOnce({ results: [FINDING], nextAfter: 1 })
        .mockResolvedValueOnce({
          results: [
            { ...FINDING, seq: 2, rowNo: 7, transactionId: "TX-000007", findingId: "F-0002" },
          ],
          nextAfter: null,
        }),
    });
    renderInRouter(<RunPage api={api} runId={RUN.id} />);
    const [first] = await screen.findAllByTestId("run-result");
    expect(first).toHaveTextContent("F-0001");
    expect(first).toHaveTextContent("TX-000004");
    expect(first).toHaveTextContent(FINDING.explanationEn ?? "");
    expect(first).toHaveTextContent("amount = 16200 (> 10000)");
    await user.click(screen.getByRole("button", { name: "Show more" }));
    await waitFor(() => expect(screen.getAllByTestId("run-result")).toHaveLength(2));
    expect(api.listRunResults).toHaveBeenLastCalledWith(RUN.id, {
      outcome: "flagged",
      ruleId: undefined,
      after: 1,
      limit: 50,
    });
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("lists transactions that couldn't be checked, with what was missing", async () => {
    const user = userEvent.setup();
    const api = makeApi(response(), {
      listRunResults: vi.fn().mockImplementation((_id: string, query: { outcome: string }) =>
        Promise.resolve({
          results: query.outcome === "could_not_check" ? [UNCHECKED] : [FINDING],
          nextAfter: null,
        }),
      ),
    });
    renderInRouter(<RunPage api={api} runId={RUN.id} />);
    await user.click(await screen.findByRole("button", { name: "Could not check" }));
    expect(await screen.findByText("approver_1_id is blank")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Could not check" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows AI checks waiting, and retries the ones AI failed", async () => {
    const user = userEvent.setup();
    const waiting = { ...RUN, totals: { ...RUN.totals, waitingForAi: 4, aiFailed: 2 } };
    const api = makeApi(response({ run: waiting }), {
      retryAiChecks: vi
        .fn()
        .mockResolvedValue(
          response({ run: { ...RUN, totals: { ...RUN.totals, waitingForAi: 6, aiFailed: 0 } } }),
        ),
    });
    renderInRouter(<RunPage api={api} runId={RUN.id} />);
    expect(
      await screen.findByText(
        "Waiting for AI: 4 transactions. Their flags appear when AI is done.",
      ),
    ).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "AI couldn't check 2 transactions; they're under Could not check.",
    );
    await user.click(within(alert).getByRole("button", { name: "Retry AI checks" }));
    expect(api.retryAiChecks).toHaveBeenCalledWith(RUN.id);
    expect(
      await screen.findByText(
        "Waiting for AI: 6 transactions. Their flags appear when AI is done.",
      ),
    ).toBeInTheDocument();
  });

  it("says it's looking for unusual patterns, then counts them", async () => {
    const looking = { ...RUN, totals: { ...RUN.totals, findingPatterns: true } };
    const done = { ...RUN, totals: { ...RUN.totals, findingPatterns: false, patterns: 3 } };
    const getRun = vi
      .fn()
      .mockResolvedValueOnce(response({ run: looking }))
      .mockResolvedValue(response({ run: done }));
    renderInRouter(<RunPage api={makeApi(response(), { getRun })} runId={RUN.id} />);
    expect(
      await screen.findByText("Looking for unusual patterns. Their flags appear when it's done."),
    ).toBeInTheDocument();
    // The page follows the search until it ends.
    await waitFor(
      () => expect(screen.queryByText(/Looking for unusual patterns/)).not.toBeInTheDocument(),
      { timeout: 5_000 },
    );
    const totals = screen.getAllByTestId("run-total");
    expect(totals.at(-1)).toHaveTextContent("Unusual patterns3");
  });

  it("shows a second opinion's progress, then how many disagreed", async () => {
    const running = {
      ...RUN,
      totals: {
        ...RUN.totals,
        secondOpinionState: "running" as const,
        secondOpinionTotal: 300,
        secondOpinionDone: 200,
      },
    };
    const done = {
      ...RUN,
      totals: {
        ...RUN.totals,
        secondOpinionState: "done" as const,
        secondOpinionTotal: 300,
        secondOpinionDone: 300,
        disagreements: 4,
      },
    };
    const getRun = vi
      .fn()
      .mockResolvedValueOnce(response({ run: running }))
      .mockResolvedValue(response({ run: done }));
    renderInRouter(<RunPage api={makeApi(response(), { getRun })} runId={RUN.id} />);
    expect(
      await screen.findByText("AI is giving a second opinion: 200 of 300 transactions read."),
    ).toBeInTheDocument();
    // The page follows the second opinion until it ends.
    expect(
      await screen.findByText(
        "AI strongly disagreed with the checks on 4 transactions. Analysts see them under Second opinions; none is a finding.",
        {},
        { timeout: 5_000 },
      ),
    ).toBeInTheDocument();
  });

  it("says in words why AI couldn't check a transaction", async () => {
    const user = userEvent.setup();
    const api = makeApi(response(), {
      listRunResults: vi.fn().mockImplementation((_id: string, query: { outcome: string }) =>
        Promise.resolve({
          results:
            query.outcome === "could_not_check"
              ? [{ ...UNCHECKED, missing: [], error: "ai_not_set_up" }]
              : [FINDING],
          nextAfter: null,
        }),
      ),
    });
    renderInRouter(<RunPage api={api} runId={RUN.id} />);
    await user.click(await screen.findByRole("button", { name: "Could not check" }));
    expect(await screen.findByText("AI isn't set up")).toBeInTheDocument();
  });

  it("checks the worked examples and offers the download once a format is confirmed", async () => {
    const api = makeApi(
      response({
        exportReady: true,
        workedExamples: [
          { row: 1, transactionId: "TX-000004", ruleId: "R-01", result: "found" },
          { row: 4, transactionId: "TX-000039", ruleId: "R-04", result: "rule_not_run" },
        ],
      }),
    );
    renderInRouter(<RunPage api={api} runId={RUN.id} />);
    const examples = await screen.findAllByTestId("worked-example");
    expect(examples[0]).toHaveTextContent("Example 1");
    expect(examples[0]).toHaveTextContent("Found");
    expect(examples[1]).toHaveTextContent("Rule not live in this run");
    expect(screen.getByRole("link", { name: "Download findings (CSV)" })).toHaveAttribute(
      "href",
      `/api/v1/runs/${RUN.id}/export`,
    );
  });
});
