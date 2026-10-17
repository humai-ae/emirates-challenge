import { type ApiClient, ApiError, type FlagDetail, type FlagPattern } from "@hrcc/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { flagDetail, ONBOARDING } from "../../test/flags";
import { renderInRouter } from "../../test/render";
import { FlagPage } from "./flag-page";

function makeApi(flag: FlagDetail, overrides: Record<string, unknown> = {}) {
  return {
    getFlag: vi.fn().mockResolvedValue({ flag }),
    confirmFlag: vi.fn().mockResolvedValue({
      flag: { ...flag, status: "confirmed", allowed: [], rowVersion: 2 },
    }),
    dismissFlag: vi.fn().mockResolvedValue({
      flag: { ...flag, status: "dismissed", allowed: [], rowVersion: 2 },
    }),
    verifyFlag: vi.fn().mockResolvedValue({
      flag: { ...flag, status: "closed", allowed: [], rowVersion: 7 },
    }),
    sendBackFlag: vi.fn().mockResolvedValue({
      flag: { ...flag, status: "being_fixed", allowed: [], rowVersion: 7 },
    }),
    ...overrides,
  } as unknown as ApiClient;
}

describe("FlagPage", () => {
  it("shows why it was flagged, the rule, the proof and what happens next", async () => {
    renderInRouter(<FlagPage api={makeApi(flagDetail())} flagId="F-000001" reader="analyst" />);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: /R-01 · Approval of large allowance changes/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("flag-why")).toHaveTextContent("no approver is grade 10 or above");
    expect(screen.getByTestId("flag-why")).toHaveTextContent("Standard wording");
    expect(screen.getAllByTestId("evidence-row")).toHaveLength(2);
    expect(screen.getByTestId("flag-proof")).toHaveTextContent(
      "Approved by E-0024 · grade 6, Human Resources",
    );
    const next = screen.getByTestId("flag-next");
    expect(next).toHaveTextContent("Rule default: High");
    expect(next).toHaveTextContent("Payroll & Compensation");
    expect(next).toHaveTextContent("HR manager");
    expect(next).toHaveTextContent(
      "The approver E-0024, grade 6, is the most senior person involved (mid band).",
    );
  });

  it("labels AI wording and shows the standard wording on request", async () => {
    const user = userEvent.setup();
    const flag = flagDetail({
      explanationEn: "TX-000006 broke R-01: the amount 11,100 is over 10,000.",
      textSources: { en: "ai", ar: "template" },
      writing: "done",
    });
    renderInRouter(<FlagPage api={makeApi(flag)} flagId="F-000001" reader="analyst" />);
    const why = await screen.findByTestId("flag-why");
    expect(why).toHaveTextContent("TX-000006 broke R-01: the amount 11,100 is over 10,000.");
    expect(why).toHaveTextContent("Written by AI and checked against the data.");
    await user.click(within(why).getByRole("button", { name: "Show standard wording" }));
    expect(why).toHaveTextContent("no approver is grade 10 or above");
    expect(why).toHaveTextContent("Standard wording, built from the transaction and the rule.");
    expect(within(why).getByRole("button", { name: "Show AI wording" })).toBeInTheDocument();
  });

  it("labels an AI-written fix, with the standard fix one click away", async () => {
    const user = userEvent.setup();
    const flag = flagDetail({
      suggestedFixEn: "Ask a grade 10 approver to approve TX-000006, or reverse it.",
      textSources: { en: "ai", ar: "template" },
      writing: "done",
    });
    renderInRouter(<FlagPage api={makeApi(flag)} flagId="F-000001" reader="analyst" />);
    const next = await screen.findByTestId("flag-next");
    expect(next).toHaveTextContent("Ask a grade 10 approver to approve TX-000006, or reverse it.");
    expect(next).toHaveTextContent(
      "Written by AI from the rule's suggested action, checked against the data.",
    );
    await user.click(within(next).getByRole("button", { name: "Show standard wording" }));
    expect(next).toHaveTextContent(
      "Get retrospective approval from a grade 10 or higher approver, or reverse it.",
    );
  });

  it("says when AI wording is on its way", async () => {
    renderInRouter(
      <FlagPage
        api={makeApi(flagDetail({ writing: "pending" }))}
        flagId="F-000001"
        reader="analyst"
      />,
    );
    expect(await screen.findByTestId("flag-why")).toHaveTextContent(
      "Standard wording for now: AI is writing a clearer one.",
    );
  });

  it("shows what AI read for a judgment, how likely it breaks the rule and how sure AI is", async () => {
    const flag = flagDetail({
      kind: "ai_judgment",
      confidence: "High",
      judgment: {
        field: "justification",
        text: "as discussed",
        decision: "breaks",
        pBreak: 0.93,
        answers: { specific: 0.04, placeholder: 0.93, accept: 0.06, enough: 0.9 },
        model: "jev-1.13.0",
        restatement: null,
      },
    });
    renderInRouter(<FlagPage api={makeApi(flag)} flagId="F-000001" reader="analyst" />);
    const block = await screen.findByTestId("flag-judgment");
    expect(block).toHaveTextContent("What AI read");
    expect(block).toHaveTextContent("justification");
    expect(block).toHaveTextContent("as discussed");
    expect(block).toHaveTextContent("93% likely it doesn't meet the rule · High confidence");
    expect(block).not.toHaveTextContent("AI's restatement");
  });

  it("says a person needs to review a text AI couldn't decide, with how AI restated it", async () => {
    const flag = flagDetail({
      kind: "ai_judgment",
      confidence: "Low",
      judgment: {
        field: "justification",
        text: "per the review",
        decision: "unsure",
        pBreak: 0.55,
        answers: { specific: 0.5, placeholder: 0.1, accept: 0.45, enough: 0.9 },
        model: "jev-1.13.0",
        restatement: {
          restated: "A raise after the annual performance review.",
          kind: "performance",
        },
      },
    });
    renderInRouter(<FlagPage api={makeApi(flag)} flagId="F-000001" reader="analyst" />);
    const block = await screen.findByTestId("flag-judgment");
    expect(screen.getByText("AI judgement · needs human review")).toBeInTheDocument();
    expect(block).toHaveTextContent(
      "AI couldn't decide: 55% likely it doesn't meet the rule. A person needs to review it.",
    );
    expect(block).toHaveTextContent(
      "AI's restatement: A raise after the annual performance review.",
    );
  });

  it("shows what counts for the rule, as the admin wrote it for the version AI used", async () => {
    const flag = flagDetail({
      kind: "ai_judgment",
      confidence: "Low",
      criteria: {
        meets: ["Names a concrete reason, such as a promotion or a market adjustment."],
        doesNotMeet: ["A placeholder, or a pointer to an email or a memo."],
      },
    });
    renderInRouter(<FlagPage api={makeApi(flag)} flagId="F-000001" reader="analyst" />);
    const counts = await screen.findByTestId("flag-criteria");
    expect(counts).toHaveTextContent("What counts");
    expect(counts).toHaveTextContent("Meets the rule:");
    expect(counts).toHaveTextContent(
      "Names a concrete reason, such as a promotion or a market adjustment.",
    );
    expect(counts).toHaveTextContent("Doesn't meet the rule:");
    expect(counts).toHaveTextContent("A placeholder, or a pointer to an email or a memo.");
  });

  const PATTERN: FlagPattern = {
    detector: "just_under_limit",
    subject: "R-01:E-1001",
    strength: 0.66,
    concern: 0.85,
    combined: 0.76,
    facts: [
      { key: "requester", value: "E-1001" },
      { key: "near_limit", value: 6 },
      { key: "of", value: 8 },
      { key: "share_pct", value: 75 },
    ],
    transactions: [
      { id: "TX-000012", rowNo: 13 },
      { id: "TX-000019", rowNo: 20 },
    ],
  };
  const patternFlag = (pattern = PATTERN) =>
    flagDetail({
      kind: "unusual_pattern",
      confidence: "High",
      ruleId: "PAT-1",
      ruleTitle: "Amounts just under a limit",
      pattern,
    });

  it("shows a pattern's title, what it looks for, its facts and how concerning AI found it", async () => {
    renderInRouter(<FlagPage api={makeApi(patternFlag())} flagId="F-000001" reader="analyst" />);
    const section = await screen.findByTestId("flag-pattern");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "PAT-1 · Amounts just under a limit",
    );
    expect(section).toHaveTextContent("What it looks for");
    expect(section).toHaveTextContent(
      "Amounts just under an approval limit, made by the same requester far more often than by others.",
    );
    expect(section).toHaveTextContent("Requests at 90–100% of the limit");
    expect(section).toHaveTextContent("75");
    expect(within(section).getByTestId("pattern-concern")).toHaveTextContent(
      "How concerning AI found it: likely control issue (85%)",
    );
    // No rule, so no rule section and no evidence table.
    expect(screen.queryByText("As the policy says it")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("evidence-row")).toEqual([]);
  });

  it("lists a pattern's transactions, and says when code ranked it alone", async () => {
    renderInRouter(
      <FlagPage
        api={makeApi(patternFlag({ ...PATTERN, concern: null }))}
        flagId="F-000001"
        reader="analyst"
      />,
    );
    const section = await screen.findByTestId("flag-pattern");
    expect(section).toHaveTextContent("TX-000012");
    expect(section).toHaveTextContent("row 13");
    expect(within(section).getByTestId("pattern-concern")).toHaveTextContent(
      "Ranked by code: AI wasn't asked",
    );
  });

  it("titles a pattern in Arabic", async () => {
    renderInRouter(
      <FlagPage api={makeApi(patternFlag())} flagId="F-000001" reader="analyst" />,
      "ar",
    );
    expect(await screen.findByTestId("flag-pattern")).toHaveTextContent("مبالغ تقل قليلًا عن حدّ");
  });

  it("confirms a flag to its team", async () => {
    const user = userEvent.setup();
    const api = makeApi(flagDetail());
    renderInRouter(<FlagPage api={api} flagId="F-000001" reader="analyst" />);
    await user.click(
      await screen.findByRole("button", { name: "Yes, send to Payroll & Compensation" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm and send" }));
    expect(api.confirmFlag).toHaveBeenCalledWith("F-000001", { rowVersion: 1 });
    expect(
      await screen.findByText("Confirmed and sent to Payroll & Compensation."),
    ).toBeInTheDocument();
  });

  it("asks for a team when the flag has none", async () => {
    const user = userEvent.setup();
    const api = makeApi(flagDetail({ ownerTeam: null }));
    renderInRouter(<FlagPage api={api} flagId="F-000001" reader="analyst" />);
    await user.click(await screen.findByRole("button", { name: "Yes, choose a team" }));
    await user.click(screen.getByRole("button", { name: "Confirm and send" }));
    expect(await screen.findByText("Choose which team it goes to.")).toBeInTheDocument();
    expect(api.confirmFlag).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByLabelText("Send to which team?"), "Onboarding");
    await user.click(screen.getByRole("button", { name: "Confirm and send" }));
    expect(api.confirmFlag).toHaveBeenCalledWith("F-000001", {
      rowVersion: 1,
      ownerTeamId: ONBOARDING.id,
    });
  });

  it("asks why when something was changed", async () => {
    const user = userEvent.setup();
    const api = makeApi(flagDetail());
    renderInRouter(<FlagPage api={api} flagId="F-000001" reader="analyst" />);
    await user.click(await screen.findByRole("button", { name: /Yes, send to/ }));
    await user.click(screen.getByText("Change severity, team or suggested fix"));
    await user.selectOptions(screen.getByLabelText("Severity"), "Low");
    await user.click(screen.getByRole("button", { name: "Confirm and send" }));
    expect(
      await screen.findByText("You changed something. Say why, so it is on record."),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Why did you change it?"), "A one-off, small amount.");
    await user.click(screen.getByRole("button", { name: "Confirm and send" }));
    expect(api.confirmFlag).toHaveBeenCalledWith("F-000001", {
      rowVersion: 1,
      severity: "Low",
      reason: "A one-off, small amount.",
    });
  });

  it("dismisses with a reason and a note", async () => {
    const user = userEvent.setup();
    const api = makeApi(flagDetail());
    renderInRouter(<FlagPage api={api} flagId="F-000001" reader="analyst" />);
    await user.click(await screen.findByRole("button", { name: "No, dismiss it" }));
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(await screen.findByText("Choose a reason.")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Data error in the export"));
    await user.type(
      screen.getByLabelText("Add a note for the record"),
      "The amount was keyed twice.",
    );
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(api.dismissFlag).toHaveBeenCalledWith("F-000001", {
      rowVersion: 1,
      reason: "data_error",
      note: "The amount was keyed twice.",
    });
    expect(await screen.findByText("Dismissed.")).toBeInTheDocument();
  });

  it("says who decided first when someone else did", async () => {
    const user = userEvent.setup();
    const api = makeApi(flagDetail(), {
      confirmFlag: vi.fn().mockRejectedValue(
        new ApiError(409, {
          code: "flag_changed",
          params: { status: "dismissed", by: "Sara Khan" },
        }),
      ),
    });
    renderInRouter(<FlagPage api={api} flagId="F-000001" reader="analyst" />);
    await user.click(await screen.findByRole("button", { name: /Yes, send to/ }));
    await user.click(screen.getByRole("button", { name: "Confirm and send" }));
    expect(
      await screen.findByText("Already dismissed by Sara Khan. The page now shows where it is."),
    ).toBeInTheDocument();
  });

  it("closes a fix, or sends it back with what is still wrong", async () => {
    const user = userEvent.setup();
    const flag = flagDetail({
      status: "fix_submitted",
      allowed: ["verify", "send_back"],
      rowVersion: 6,
      fix: {
        type: "retrospective_approval",
        note: "A grade 12 approver signed off.",
        by: "Priya Nair",
        byId: "u-priya",
        at: "2026-10-17T09:00:00.000Z",
      },
    });
    const api = makeApi(flag);
    const { unmount } = renderInRouter(<FlagPage api={api} flagId="F-000001" reader="analyst" />);
    const panel = await screen.findByTestId("fix-check-panel");
    expect(panel).toHaveTextContent(
      "Retrospective approval obtained: A grade 12 approver signed off.",
    );
    await user.click(within(panel).getByRole("button", { name: "Fix looks right, close it" }));
    expect(api.verifyFlag).toHaveBeenCalledWith("F-000001", { rowVersion: 6 });
    unmount();

    renderInRouter(<FlagPage api={api} flagId="F-000001" reader="analyst" />);
    await user.click(await screen.findByRole("button", { name: "Not fixed, send it back" }));
    await user.click(screen.getByRole("button", { name: "Send back to Payroll & Compensation" }));
    expect(await screen.findByText("Fill in this field.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("What's still wrong?"), "The sign-off has no date.");
    await user.click(screen.getByRole("button", { name: "Send back to Payroll & Compensation" }));
    expect(api.sendBackFlag).toHaveBeenCalledWith("F-000001", {
      rowVersion: 6,
      reason: "The sign-off has no date.",
    });
  });

  it("says when a flag isn't there", async () => {
    const api = makeApi(flagDetail(), {
      getFlag: vi.fn().mockRejectedValue(new ApiError(404, { code: "not_found", params: {} })),
    });
    renderInRouter(<FlagPage api={api} flagId="F-000404" reader="lead" />);
    expect(await screen.findByText("This flag isn't here")).toBeInTheDocument();
  });

  it("reads in Arabic", async () => {
    renderInRouter(
      <FlagPage api={makeApi(flagDetail())} flagId="F-000001" reader="analyst" />,
      "ar",
    );
    expect(await screen.findByTestId("flag-why")).toHaveTextContent("ولا يوجد معتمد بدرجة 10");
    expect(screen.getAllByText("عالية").length).toBeGreaterThan(0);
  });
});
