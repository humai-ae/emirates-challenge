import { type ApiClient, ApiError, type RuleRequest } from "@hrcc/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderInRouter } from "../../test/render";
import { RequestsPage } from "./requests-page";

const TEXT = "Leave over 30 days needs HR Manager approval.";
const request = (overrides: Partial<RuleRequest> = {}): RuleRequest => ({
  ruleId: "W-01",
  title: "Leave over 30 days needs HR Manager approval",
  text: TEXT,
  requestedBy: "Omar Siddiqui",
  requestedAt: "2026-10-16T08:00:00.000Z",
  outcome: "waiting",
  reason: null,
  ...overrides,
});

function makeApi(overrides: Record<string, unknown> = {}) {
  return {
    listRuleRequests: vi.fn().mockResolvedValue({ requests: [] }),
    requestRule: vi.fn().mockResolvedValue({ request: request({ outcome: "drafting" }) }),
    ...overrides,
  } as unknown as ApiClient;
}

describe("RequestsPage", () => {
  it("sends a rule to the admin and lists it with its outcome", async () => {
    const user = userEvent.setup();
    const listRuleRequests = vi
      .fn()
      .mockResolvedValueOnce({ requests: [] })
      .mockResolvedValue({ requests: [request({ outcome: "drafting" })] });
    const api = makeApi({ listRuleRequests });
    renderInRouter(<RequestsPage api={api} />);
    expect(await screen.findByText("You haven't requested any rules yet.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("The rule, in plain words"), TEXT);
    await user.click(screen.getByRole("button", { name: "Send to the admin" }));
    expect(api.requestRule).toHaveBeenCalledWith({ text: TEXT });
    expect(await screen.findByText("Sent to the admin for review.")).toBeInTheDocument();
    const item = await screen.findByTestId("rule-request");
    expect(within(item).getByText("AI is drafting it")).toBeInTheDocument();
    expect(within(item).getByText("W-01")).toBeInTheDocument();
  });

  it("shows why a request was rejected", async () => {
    const api = makeApi({
      listRuleRequests: vi.fn().mockResolvedValue({
        requests: [request({ outcome: "rejected", reason: "Rule R-02 covers this already." })],
      }),
    });
    renderInRouter(<RequestsPage api={api} />);
    const item = await screen.findByTestId("rule-request");
    expect(within(item).getByText("Rejected")).toBeInTheDocument();
    expect(within(item).getByText("Reason: Rule R-02 covers this already.")).toBeInTheDocument();
  });

  it("explains that requests open once data is loaded", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      requestRule: vi.fn().mockRejectedValue(new ApiError(409, { code: "no_dataset", params: {} })),
    });
    renderInRouter(<RequestsPage api={api} />);
    await user.type(await screen.findByLabelText("The rule, in plain words"), TEXT);
    await user.click(screen.getByRole("button", { name: "Send to the admin" }));
    expect(
      await screen.findByText("Rule requests open once the admin has loaded data."),
    ).toBeInTheDocument();
  });
});
