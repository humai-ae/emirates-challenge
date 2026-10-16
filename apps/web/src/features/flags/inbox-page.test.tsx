import type { ApiClient, InboxResponse } from "@hrcc/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { flagSummary, ONBOARDING, PAYROLL } from "../../test/flags";
import { renderInRouter } from "../../test/render";
import { InboxPage } from "./inbox-page";

function inbox(overrides: Partial<InboxResponse> = {}): InboxResponse {
  return {
    flags: [
      flagSummary(),
      flagSummary({
        id: "F-000009",
        ruleId: "R-03",
        ruleTitle: "Exit documents",
        severity: "Medium",
        ownerTeam: null,
        transactionIds: ["TX-000171"],
      }),
    ],
    nextAfter: null,
    matching: 2,
    total: 2,
    bySeverity: { High: 1, Medium: 1, Low: 0 },
    byKind: { rule_break: 2, ai_judgment: 0, unusual_pattern: 0 },
    filters: {
      rules: [
        { id: "R-01", title: "Approval of large allowance changes" },
        { id: "R-03", title: "Exit documents" },
      ],
      teams: [ONBOARDING, PAYROLL],
      runs: ["RUN-2026-10-16-01"],
    },
    lastRun: { id: "RUN-2026-10-16-01", finishedAt: "2026-10-16T08:00:00.000Z" },
    ...overrides,
  };
}

const makeApi = (getInbox = vi.fn().mockResolvedValue(inbox())) =>
  ({ getInbox }) as unknown as ApiClient;

describe("InboxPage", () => {
  it("lists the flags waiting, most severe first, with how many there are", async () => {
    renderInRouter(<InboxPage api={makeApi()} />);
    expect(await screen.findByTestId("inbox-summary")).toHaveTextContent("2 waiting · 1 High");
    const rows = screen.getAllByTestId("flag-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByRole("link", { name: /R-01/ })).toHaveAttribute(
      "href",
      "/analyst/flags/F-000001",
    );
    expect(rows[0]).toHaveTextContent("Payroll & Compensation");
    expect(rows[1]).toHaveTextContent("No team yet");
    expect(screen.getByText("Showing 2 of 2, most severe first")).toBeInTheDocument();
  });

  it("shows an AI judgment's confidence with its kind", async () => {
    const getInbox = vi
      .fn()
      .mockResolvedValue(
        inbox({ flags: [flagSummary({ kind: "ai_judgment", confidence: "Low" })] }),
      );
    renderInRouter(<InboxPage api={makeApi(getInbox)} />);
    expect(await screen.findByText("AI judgement · Low confidence")).toBeInTheDocument();
  });

  it("marks a flag whose wording AI wrote", async () => {
    const getInbox = vi
      .fn()
      .mockResolvedValue(
        inbox({ flags: [flagSummary({ textSources: { en: "ai", ar: "template" } })] }),
      );
    renderInRouter(<InboxPage api={makeApi(getInbox)} />);
    expect(await screen.findByText("AI wording")).toBeInTheDocument();
  });

  it("filters by team and severity", async () => {
    const user = userEvent.setup();
    const getInbox = vi.fn().mockResolvedValue(inbox());
    renderInRouter(<InboxPage api={makeApi(getInbox)} />);
    await screen.findByTestId("inbox-summary");
    await user.selectOptions(screen.getByLabelText("Team"), "No team yet");
    expect(getInbox).toHaveBeenLastCalledWith({ teamId: "none", after: undefined });
    await user.selectOptions(screen.getByLabelText("Severity"), "Medium");
    expect(getInbox).toHaveBeenLastCalledWith({
      teamId: "none",
      severity: "Medium",
      after: undefined,
    });
  });

  it("shows more on request", async () => {
    const user = userEvent.setup();
    const getInbox = vi
      .fn()
      .mockResolvedValueOnce(inbox({ nextAfter: "cursor-1", matching: 3 }))
      .mockResolvedValueOnce(
        inbox({ flags: [flagSummary({ id: "F-000010", ruleId: "R-04" })], matching: 3 }),
      );
    renderInRouter(<InboxPage api={makeApi(getInbox)} />);
    await user.click(await screen.findByRole("button", { name: "Show more" }));
    expect(getInbox).toHaveBeenLastCalledWith({ after: "cursor-1" });
    expect(await screen.findByText("Showing 3 of 3, most severe first")).toBeInTheDocument();
  });

  it("says when nothing is waiting, and when the last check ran", async () => {
    renderInRouter(
      <InboxPage
        api={makeApi(
          vi.fn().mockResolvedValue(
            inbox({
              flags: [],
              matching: 0,
              total: 0,
              bySeverity: { High: 0, Medium: 0, Low: 0 },
            }),
          ),
        )}
      />,
    );
    expect(await screen.findByText("No flags waiting")).toBeInTheDocument();
    expect(screen.getByText(/The last check, RUN-2026-10-16-01, finished/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the daily report" })).toHaveAttribute(
      "href",
      "/analyst/report",
    );
  });
});
