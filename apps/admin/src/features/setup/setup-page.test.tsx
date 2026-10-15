import type { ApiClient, DatasetSummary, Rule } from "@hrcc/shared";
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderInRouter } from "../../test/render";
import { APPROVED, ruleOf, ruleVersion } from "../../test/rules";
import { SetupPage } from "./setup-page";

const ready: DatasetSummary = {
  id: "5d9b5c1e-3f0a-4c8e-9a71-2b6f4e8d1c30",
  name: "Training pack",
  status: "ready",
  rejection: null,
  transactionCount: 300,
  employeeCount: 60,
  periodFrom: "2025-01-02",
  periodTo: "2025-12-30",
  issueCount: 3,
  columnsConfirmed: false,
  createdAt: "2026-10-15T09:00:00.000Z",
  createdBy: "Layla Haddad",
};

const makeApi = (datasets: DatasetSummary[], rules: Rule[] = []) =>
  ({
    listDatasets: vi.fn().mockResolvedValue({ datasets }),
    listRules: vi.fn().mockResolvedValue({ rules, dataset: null }),
  }) as unknown as ApiClient;

describe("SetupPage", () => {
  it("starts with uploading data", async () => {
    renderInRouter(<SetupPage api={makeApi([])} />);
    const steps = await screen.findAllByTestId("setup-step");
    expect(steps).toHaveLength(4);
    expect(steps[0]).toHaveTextContent("To do");
    expect(
      within(steps[0] as HTMLElement).getByRole("link", { name: "Go to Data" }),
    ).toHaveAttribute("href", "/data");
    expect(steps[1]).toHaveTextContent("Upload data first.");
    expect(steps[2]).toHaveTextContent("To do");
    expect(steps[2]).toHaveTextContent("Upload data first: rules are matched to its columns.");
    expect(steps[3]).toHaveTextContent("Later");
  });

  it("points to the latest dataset's columns until they are confirmed", async () => {
    renderInRouter(
      <SetupPage
        api={makeApi([
          ready,
          { ...ready, id: "6e0c6d2f-4a1b-4d9f-8b82-3c7a5f9e2d41", name: "Older" },
        ])}
      />,
    );
    const steps = await screen.findAllByTestId("setup-step");
    expect(steps[0]).toHaveTextContent("Done");
    expect(steps[0]).toHaveTextContent("Training pack · Transactions: 300 · Employees: 60");
    expect(
      within(steps[1] as HTMLElement).getByRole("link", { name: "Check the columns" }),
    ).toHaveAttribute("href", `/data/${ready.id}`);
  });

  it("marks both data steps done once the columns are confirmed", async () => {
    renderInRouter(<SetupPage api={makeApi([{ ...ready, columnsConfirmed: true }])} />);
    const steps = await screen.findAllByTestId("setup-step");
    expect(steps[0]).toHaveTextContent("Done");
    expect(steps[1]).toHaveTextContent("Done");
    expect(steps[1]).toHaveTextContent("Every column's role is confirmed.");
  });

  it("doesn't count a rejected dataset as done", async () => {
    renderInRouter(
      <SetupPage
        api={makeApi([
          { ...ready, status: "rejected", rejection: "no_transaction_id", columnsConfirmed: true },
        ])}
      />,
    );
    const steps = await screen.findAllByTestId("setup-step");
    expect(steps[0]).toHaveTextContent("To do");
    expect(steps[0]).toHaveTextContent("Training pack needs a column before it can be used.");
    expect(
      within(steps[0] as HTMLElement).getByRole("link", { name: "Check the columns" }),
    ).toHaveAttribute("href", `/data/${ready.id}`);
    expect(steps[1]).toHaveTextContent("To do");
    expect(steps[1]).not.toHaveTextContent("Every column's role is confirmed.");
  });

  it("marks the policy step done once rules exist", async () => {
    const rules = [
      ruleOf([ruleVersion({ status: "active", ...APPROVED })]),
      ruleOf([ruleVersion()], { id: "R-02", title: "No self-approval" }),
    ];
    renderInRouter(<SetupPage api={makeApi([{ ...ready, columnsConfirmed: true }], rules)} />);
    const steps = await screen.findAllByTestId("setup-step");
    const policy = within(steps[2] as HTMLElement);
    expect(await policy.findByText(/2 rules · 1 live/)).toBeInTheDocument();
    expect(steps[2]).toHaveTextContent("Done");
    expect(policy.getByRole("link", { name: "Go to Rules" })).toHaveAttribute("href", "/rules");
  });
});
