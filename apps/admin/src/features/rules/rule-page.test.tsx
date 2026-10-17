import type { ApiClient, Parameter, Rule, RuleResponse, RuleVersion } from "@hrcc/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderInRouter } from "../../test/render";
import {
  AI_META,
  APPROVED,
  CHECK,
  DATASET,
  PREVIEW,
  RESTATEMENT_AR,
  RESTATEMENT_EN,
  ruleOf,
  SOURCE,
  SUGGESTED_AR,
  SUGGESTED_EN,
  VALUES,
  ruleVersion as version,
} from "../../test/rules";
import { RulePage } from "./rule-page";

const PAYROLL = "0b6c1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4";
const CRITERIA = {
  meets: ["Names a concrete reason, such as a promotion or a market adjustment."],
  doesNotMeet: ["A placeholder, or a pointer to an email or a memo."],
};
const JUDGMENT_PARAMETERS: Parameter[] = [
  { name: "types", type: "string[]", value: ["pay_change"], editedByAdmin: false },
  { name: "text_field", type: "column", value: "justification", editedByAdmin: false },
  { name: "amount_over", type: "number", value: 5000, editedByAdmin: false },
];
/** R-07, a judgment rule, with what counts as its admin wrote it. */
const JUDGMENT: Partial<RuleVersion> = {
  preset: "text_judgment",
  parameters: JUDGMENT_PARAMETERS,
  check: {
    ...CHECK,
    checkKind: "judgment",
    preset: "text_judgment",
    fieldsUsed: ["justification", "amount"],
    parameters: JUDGMENT_PARAMETERS,
  },
  severity: "Medium",
  criteria: CRITERIA,
};
const MEETS = "Meets the rule — one per line";
const DOES_NOT_MEET = "Doesn't meet the rule — one per line";
const response = (rule: Rule): RuleResponse => ({ rule, dataset: DATASET, reviewRequests: [] });

function makeApi(rule: Rule, overrides: Record<string, unknown> = {}) {
  return {
    getRule: vi.fn().mockResolvedValue(response(rule)),
    listTeams: vi.fn().mockResolvedValue({
      teams: [
        {
          id: PAYROLL,
          nameEn: "Payroll & Compensation",
          nameAr: "الرواتب والتعويضات",
        },
      ],
    }),
    previewRule: vi.fn().mockResolvedValue(PREVIEW),
    updateRuleDraft: vi.fn().mockResolvedValue(response(rule)),
    approveRule: vi.fn().mockResolvedValue(response(rule)),
    rejectRule: vi.fn().mockResolvedValue(response(rule)),
    editRule: vi.fn().mockResolvedValue(response(rule)),
    retireRule: vi.fn().mockResolvedValue(response(rule)),
    ...overrides,
  } as unknown as ApiClient;
}

describe("RulePage", () => {
  it("shows the policy text beside the drafted check, and says it was drafted without AI", async () => {
    const api = makeApi(ruleOf([version()]));
    renderInRouter(<RulePage api={api} ruleId="R-01" />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Approval of large allowance changes" }),
    ).toBeInTheDocument();
    expect(screen.getByText(SOURCE)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Drafted without AI from the rule's words. Check every value before approving.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Check type")).toHaveValue("approver_min_grade");
    expect(screen.getByRole("radio", { name: "Only these types" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "allowance_change" })).toBeChecked();
    expect(screen.getByLabelText("Amounts over")).toHaveValue(10000);
    // Only a judgment rule says what counts.
    expect(screen.queryByLabelText(MEETS)).not.toBeInTheDocument();
    const preview = screen.getByTestId("rule-preview");
    expect(await within(preview).findByText(RESTATEMENT_EN)).toBeInTheDocument();
    expect(
      within(preview).getByText("Flags 7 of 88 transactions it applies to."),
    ).toBeInTheDocument();
    expect(api.previewRule).toHaveBeenCalledWith({ preset: "approver_min_grade", values: VALUES });
    const user = userEvent.setup();
    await user.click(within(preview).getByRole("button", { name: "Show examples" }));
    expect(within(preview).getByText("TX-000004")).toBeInTheDocument();
    expect(within(preview).getByText("Amount just under the limit")).toBeInTheDocument();
  });

  it("saves the admin's edits to the draft", async () => {
    const user = userEvent.setup();
    const api = makeApi(ruleOf([version()]));
    renderInRouter(<RulePage api={api} ruleId="R-01" />);
    const limit = await screen.findByLabelText("Amounts over");
    await user.clear(limit);
    await user.type(limit, "15000");
    await screen.findByRole("option", { name: "Payroll & Compensation" });
    // By value: user-event matches option labels against their HTML, where "&" is "&amp;".
    await user.selectOptions(screen.getByLabelText("Owner"), PAYROLL);
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(api.updateRuleDraft).toHaveBeenCalledWith("R-01", {
        rowVersion: 1,
        preset: "approver_min_grade",
        values: { ...VALUES, amount_limit: 15000 },
        severity: "High",
        ownerTeamId: PAYROLL,
        suggestedActionEn: SUGGESTED_EN,
        suggestedActionAr: SUGGESTED_AR,
      }),
    );
  });

  it("says what counts for a judgment rule, one item per line, and saves it with the draft", async () => {
    const user = userEvent.setup();
    const api = makeApi(ruleOf([version(JUDGMENT)]));
    renderInRouter(<RulePage api={api} ruleId="R-01" />);
    const meets = await screen.findByLabelText(MEETS);
    expect(meets).toHaveValue(CRITERIA.meets.join("\n"));
    expect(screen.getByLabelText(DOES_NOT_MEET)).toHaveValue(CRITERIA.doesNotMeet.join("\n"));
    await user.type(meets, "{Enter}{Enter}  A correction of an earlier error.  ");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(api.updateRuleDraft).toHaveBeenCalledWith(
        "R-01",
        expect.objectContaining({
          preset: "text_judgment",
          criteria: {
            meets: [...CRITERIA.meets, "A correction of an earlier error."],
            doesNotMeet: CRITERIA.doesNotMeet,
          },
        }),
      ),
    );
  });

  it("saves no criteria when both lists are empty, and keeps each list to ten lines", async () => {
    const user = userEvent.setup();
    const api = makeApi(ruleOf([version(JUDGMENT)]));
    renderInRouter(<RulePage api={api} ruleId="R-01" />);
    const meets = await screen.findByLabelText(MEETS);
    await user.clear(meets);
    await user.type(meets, Array.from({ length: 11 }, (_, i) => `Reason ${i + 1}`).join("{Enter}"));
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Use 10 lines or fewer.")).toBeInTheDocument();
    expect(api.updateRuleDraft).not.toHaveBeenCalled();

    await user.clear(meets);
    await user.clear(screen.getByLabelText(DOES_NOT_MEET));
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(api.updateRuleDraft).toHaveBeenCalledWith(
        "R-01",
        expect.objectContaining({ criteria: null }),
      ),
    );
  });

  it("lists what counts on a live judgment rule", async () => {
    const api = makeApi(ruleOf([version({ ...JUDGMENT, status: "active", ...APPROVED })]));
    renderInRouter(<RulePage api={api} ruleId="R-01" />);
    expect(await screen.findByText("Meets the rule")).toBeInTheDocument();
    expect(screen.getByText(CRITERIA.meets[0] ?? "")).toBeInTheDocument();
    expect(screen.getByText("Doesn't meet the rule")).toBeInTheDocument();
    expect(screen.getByText(CRITERIA.doesNotMeet[0] ?? "")).toBeInTheDocument();
  });

  it("approves a saved draft, but not while changes are unsaved", async () => {
    const user = userEvent.setup();
    const api = makeApi(ruleOf([version()]));
    renderInRouter(<RulePage api={api} ruleId="R-01" />);
    const approve = await screen.findByRole("button", { name: "Approve" });
    expect(approve).toBeEnabled();
    const grade = screen.getByLabelText("Lowest approver grade");
    await user.type(grade, "1");
    expect(approve).toBeDisabled();
    expect(screen.getByText("Save your changes before approving.")).toBeInTheDocument();
    await user.clear(grade);
    await user.type(grade, "10");
    expect(approve).toBeEnabled();
    await user.click(approve);
    await waitFor(() => expect(api.approveRule).toHaveBeenCalledWith("R-01", { rowVersion: 1 }));
  });

  it("rejects a draft only with a reason", async () => {
    const user = userEvent.setup();
    const api = makeApi(ruleOf([version()]));
    renderInRouter(<RulePage api={api} ruleId="R-01" />);
    await user.click(await screen.findByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Reject the draft of R-01?");
    await user.click(within(dialog).getByRole("button", { name: "Reject draft" }));
    expect(await within(dialog).findByText("Fill in this field.")).toBeInTheDocument();
    expect(api.rejectRule).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText("Reason"), "Covered by the payroll control");
    await user.click(within(dialog).getByRole("button", { name: "Reject draft" }));
    await waitFor(() =>
      expect(api.rejectRule).toHaveBeenCalledWith("R-01", {
        rowVersion: 1,
        reason: "Covered by the payroll control",
      }),
    );
  });

  it("explains a draft that needs data, and can't approve it", async () => {
    const needs = [{ file: "transactions" as const, role: "approver_ids" }];
    const api = makeApi(ruleOf([version({ status: "needs_data", check: null, needs })]), {
      previewRule: vi.fn().mockResolvedValue({
        dataset: PREVIEW.dataset,
        result: { status: "needs_data", needs },
      }),
    });
    renderInRouter(<RulePage api={api} ruleId="R-01" />);
    expect(
      await screen.findByText(
        "The data has no column for: Approvers. Give a column that role on the Data page, or choose another check type.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(
      await screen.findByText("Can't preview: the data has no column for Approvers."),
    ).toBeInTheDocument();
  });

  it("lets the admin choose a check type when none matched", async () => {
    const user = userEvent.setup();
    const failed = version({
      status: "draft_failed",
      preset: null,
      parameters: [],
      check: null,
      restatementEn: null,
      restatementAr: null,
      draftError: "no_match",
      severity: "Medium",
    });
    const api = makeApi(ruleOf([failed]));
    renderInRouter(<RulePage api={api} ruleId="R-01" />);
    expect(
      await screen.findByText("No check type matched this rule's words. Choose one below."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Check type")).toHaveValue("");
    expect(api.previewRule).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByLabelText("Check type"), "requester_not_approver");
    expect(screen.getByRole("radio", { name: "All transaction types" })).toBeChecked();
    await waitFor(() =>
      expect(api.previewRule).toHaveBeenCalledWith({
        preset: "requester_not_approver",
        values: { types: null },
      }),
    );
  });

  it("opens a new draft of a live rule, and retires it with a reason", async () => {
    const user = userEvent.setup();
    const live = version({ status: "active", ...APPROVED });
    const api = makeApi(ruleOf([live], { rowVersion: 2 }));
    renderInRouter(<RulePage api={api} ruleId="R-01" />);
    expect(await screen.findByRole("heading", { name: "Live check" })).toBeInTheDocument();
    expect(screen.getByText("10,000")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expect(api.editRule).toHaveBeenCalledWith("R-01", { rowVersion: 2 }));
    await user.click(screen.getByRole("button", { name: "Retire" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Reason"), "Policy withdrawn");
    await user.click(within(dialog).getByRole("button", { name: "Retire rule" }));
    await waitFor(() =>
      expect(api.retireRule).toHaveBeenCalledWith("R-01", {
        rowVersion: 2,
        reason: "Policy withdrawn",
      }),
    );
  });

  it("lists every version with who decided and why", async () => {
    const closed = { closedAt: "2026-10-16T10:00:00.000Z", closedBy: "Layla Haddad" };
    const api = makeApi(
      ruleOf(
        [
          version({ version: 4 }),
          version({ version: 3, status: "active", ...APPROVED }),
          version({ version: 2, status: "rejected", ...closed, reason: "Duplicate" }),
          version({ version: 1, status: "retired", ...APPROVED, ...closed, closedFor: "replaced" }),
        ],
        { rowVersion: 6 },
      ),
    );
    renderInRouter(<RulePage api={api} ruleId="R-01" />);
    const items = await screen.findAllByTestId("rule-version");
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent("Version 4");
    expect(items[0]).toHaveTextContent("Draft");
    expect(items[0]).toHaveTextContent("Drafted without AI");
    expect(items[1]).toHaveTextContent("Live");
    expect(items[1]).toHaveTextContent("Approved");
    expect(items[2]).toHaveTextContent("Reason: Duplicate");
    expect(items[3]).toHaveTextContent("Replaced by a newer version.");
  });

  it("keeps the policy text as written and Latin digits in Arabic", async () => {
    const api = makeApi(ruleOf([version()]));
    renderInRouter(<RulePage api={api} ruleId="R-01" />, "ar");
    expect(await screen.findByText(SOURCE)).toBeInTheDocument();
    const preview = screen.getByTestId("rule-preview");
    expect(await within(preview).findByText(RESTATEMENT_AR)).toBeInTheDocument();
    expect(preview.textContent).toMatch(/7/);
    expect(preview.textContent).not.toMatch(/[٠-٩]/);
  });

  it("says AI is drafting the rule, and shows no form until it has", async () => {
    const api = makeApi(
      ruleOf([version({ status: "drafting", preset: null, parameters: [], check: null })]),
    );
    renderInRouter(<RulePage api={api} ruleId="R-01" />);
    expect(await screen.findByText(/AI is drafting this rule's check/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
  });

  it("says how sure AI was, and marks the value it was least sure of", async () => {
    const api = makeApi(ruleOf([version({ draftedBy: "ai", draftMeta: AI_META })]));
    renderInRouter(<RulePage api={api} ruleId="R-01" />);
    expect(
      await screen.findByText(
        "Drafted by AI (jev-1.13.0). It was least sure about Lowest approver grade (81% sure). Check every value before approving.",
      ),
    ).toBeInTheDocument();
    const grade = screen.getByLabelText("Lowest approver grade").closest("div") as HTMLElement;
    expect(within(grade).getByText("Least sure")).toBeInTheDocument();
    expect(screen.getByText(/AI wrote this suggested fix/)).toBeInTheDocument();
  });

  it("says when AI wasn't available, and explains an incomplete AI draft", async () => {
    const fallback = makeApi(
      ruleOf([
        version({
          draftMeta: { ai: null, aiProblem: "unavailable", suggestedActionBy: "template" },
        }),
      ]),
    );
    const { unmount } = renderInRouter(<RulePage api={fallback} ruleId="R-01" />);
    expect(await screen.findByText(/AI wasn't available/)).toBeInTheDocument();
    unmount();
    const incomplete = makeApi(
      ruleOf([
        version({
          status: "draft_failed",
          draftError: "incomplete",
          draftedBy: "ai",
          check: null,
          draftMeta: {
            ...AI_META,
            ai: {
              model: "jev-1.13.0",
              questionSet: "rule-draft-v1",
              confidence: 0.4,
              weakest: "amount_limit",
            },
          },
          parameters: [
            { name: "types", type: "string[]", value: null, editedByAdmin: false },
            { name: "amount_limit", type: "number", value: null, editedByAdmin: false },
            { name: "min_approver_grade", type: "integer", value: 10, editedByAdmin: false },
          ],
        }),
      ]),
    );
    renderInRouter(<RulePage api={incomplete} ruleId="R-01" />);
    expect(await screen.findByText(/don't give every value it needs/)).toBeInTheDocument();
    expect(screen.getByLabelText("Check type")).toHaveValue("approver_min_grade");
  });

  it("drafts the rule again after asking", async () => {
    const user = userEvent.setup();
    const rule = ruleOf([version()], { rowVersion: 4 });
    const redraftRule = vi.fn().mockResolvedValue({
      rule: ruleOf([version({ status: "drafting", preset: null, parameters: [], check: null })], {
        rowVersion: 5,
      }),
      dataset: DATASET,
    });
    renderInRouter(<RulePage api={makeApi(rule, { redraftRule })} ruleId="R-01" />);
    await user.click(await screen.findByRole("button", { name: "Draft again" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Draft R-01 again?");
    await user.click(within(dialog).getByRole("button", { name: "Draft again" }));
    expect(redraftRule).toHaveBeenCalledWith("R-01", { rowVersion: 4 });
    expect(await screen.findByText(/AI is drafting this rule's check/)).toBeInTheDocument();
  });
});
