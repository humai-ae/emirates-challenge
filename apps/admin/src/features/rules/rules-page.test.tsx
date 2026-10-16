import {
  type ApiClient,
  ApiError,
  type PolicyUploadResponse,
  type RulesListResponse,
} from "@hrcc/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderInRouter } from "../../test/render";
import { APPROVED, DATASET, ruleOf, ruleVersion } from "../../test/rules";
import { RulesPage } from "./rules-page";

const RULES: RulesListResponse = {
  dataset: DATASET,
  drafting: null,
  rules: [
    ruleOf([ruleVersion({ version: 2 }), ruleVersion({ status: "active", ...APPROVED })], {
      rowVersion: 3,
    }),
    ruleOf(
      [
        ruleVersion({
          status: "needs_data",
          preset: "requester_not_approver",
          parameters: [{ name: "types", type: "string[]", value: null, editedByAdmin: false }],
          check: null,
          needs: [{ file: "transactions", role: "approver_ids" }],
        }),
      ],
      { id: "R-02", title: "No self-approval" },
    ),
    ruleOf(
      [
        ruleVersion({
          status: "draft_failed",
          preset: null,
          parameters: [],
          check: null,
          restatementEn: null,
          restatementAr: null,
          draftError: "no_match",
          severity: "Medium",
        }),
      ],
      { id: "W-01", title: "Treat colleagues with respect" },
    ),
  ],
};

const UPLOAD: PolicyUploadResponse = {
  upload: {
    id: "7f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f",
    filename: "policy_rules.md",
    rulesFound: 8,
    created: ["R-01", "R-02", "R-03", "R-04", "R-04b", "R-05", "R-06", "R-07"],
    changed: [],
    unchanged: [],
    warnings: [{ code: "duplicate_id", id: "R-04", renamedTo: "R-04b" }],
    ownerTable: [],
    drafting: false,
  },
};

function makeApi(overrides: Record<string, unknown> = {}) {
  return {
    listRules: vi.fn().mockResolvedValue(RULES),
    uploadPolicy: vi.fn().mockResolvedValue(UPLOAD),
    createRule: vi.fn().mockResolvedValue({ rule: RULES.rules[2], dataset: DATASET }),
    ...overrides,
  } as unknown as ApiClient;
}

const policy = (name = "policy_rules.md") =>
  new File(["## R-01 Approval\nAllowance changes need approval.\n"], name, {
    type: "text/markdown",
  });

describe("RulesPage", () => {
  it("asks for data before rules", async () => {
    const api = makeApi({
      listRules: vi.fn().mockResolvedValue({ rules: [], dataset: null, drafting: null }),
    });
    renderInRouter(<RulesPage api={api} onCreated={vi.fn()} />);
    expect(await screen.findByText("Load data first")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Data" })).toHaveAttribute("href", "/data");
    expect(screen.queryByRole("button", { name: "Upload policy" })).not.toBeInTheDocument();
  });

  it("lists rules with their status, check type and severity", async () => {
    renderInRouter(<RulesPage api={makeApi()} onCreated={vi.fn()} />);
    const rows = await screen.findAllByTestId("rule-row");
    expect(rows).toHaveLength(3);
    const first = within(rows[0] as HTMLElement);
    expect(
      first.getByRole("link", { name: "Approval of large allowance changes" }),
    ).toHaveAttribute("href", "/rules/R-01");
    expect(first.getByText("Live")).toBeInTheDocument();
    expect(first.getByText("Draft")).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent("An approver at a minimum grade");
    expect(rows[0]).toHaveTextContent("High");
    expect(within(rows[1] as HTMLElement).getByText("Needs data")).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText("No check type")).toBeInTheDocument();
    expect(rows[2]).toHaveTextContent("—");
    expect(screen.getByText("Matched to Training pack · 300 transactions")).toBeInTheDocument();
  });

  it("uploads a policy and reports what was found", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    renderInRouter(<RulesPage api={api} onCreated={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Upload policy" }));
    await user.upload(screen.getByLabelText("Policy document"), policy());
    expect(screen.getByTestId("chosen-policy")).toHaveTextContent("policy_rules.md");
    await user.click(screen.getByRole("button", { name: "Upload and draft" }));
    await waitFor(() => expect(api.uploadPolicy).toHaveBeenCalledTimes(1));
    const body = vi.mocked(api.uploadPolicy).mock.calls[0]?.[0];
    expect(body?.get("policy")).toBeInstanceOf(File);
    expect((body?.get("policy") as File | undefined)?.name).toBe("policy_rules.md");
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("8 rules found: 8 new, 0 changed, 0 unchanged.");
    expect(status).toHaveTextContent("R-04 appears more than once; the repeat is now R-04b.");
    await waitFor(() => expect(api.listRules).toHaveBeenCalledTimes(2));
  });

  it("refuses a file that isn't a policy before uploading it", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const api = makeApi();
    renderInRouter(<RulesPage api={api} onCreated={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Upload policy" }));
    await user.upload(screen.getByLabelText("Policy document"), policy("policy.pdf"));
    await user.click(screen.getByRole("button", { name: "Upload and draft" }));
    expect(await screen.findByText("Choose a .md, .markdown or .txt file.")).toBeInTheDocument();
    expect(api.uploadPolicy).not.toHaveBeenCalled();
  });

  it("explains a policy the API can't read", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      uploadPolicy: vi.fn().mockRejectedValue(
        new ApiError(400, {
          code: "file_unreadable",
          params: { file: "policy", reason: "not_utf8" },
        }),
      ),
    });
    renderInRouter(<RulesPage api={api} onCreated={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Upload policy" }));
    await user.upload(screen.getByLabelText("Policy document"), policy());
    await user.click(screen.getByRole("button", { name: "Upload and draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The policy isn't saved as UTF-8. Save it as UTF-8 text and upload it again.",
    );
  });

  it("writes a rule and opens it", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    const api = makeApi();
    renderInRouter(<RulesPage api={api} onCreated={onCreated} />);
    await user.click(await screen.findByRole("button", { name: "Write a rule" }));
    await user.click(screen.getByRole("button", { name: "Draft the rule" }));
    expect(await screen.findByText("Fill in this field.")).toBeInTheDocument();
    await user.type(
      screen.getByLabelText("The rule, as the policy would say it"),
      "Treat colleagues with respect.",
    );
    await user.click(screen.getByRole("button", { name: "Draft the rule" }));
    await waitFor(() =>
      expect(api.createRule).toHaveBeenCalledWith({ text: "Treat colleagues with respect." }),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(RULES.rules[2]));
  });
});
