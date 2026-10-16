import type { ApiClient, RunResponse } from "@hrcc/shared";
import { screen, waitFor } from "@testing-library/react";
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
