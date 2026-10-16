import { existsSync, readFileSync } from "node:fs";
import {
  aiDraftInput,
  analyzeDataset,
  composeAiDraft,
  type DraftColumn,
  datasetInputFromAnalysis,
  datasetVocabulary,
  prepareDataset,
  readCsv,
  splitPolicy,
  unsupportedNumbers,
  type Vocabulary,
} from "@hrcc/engine";
import { describe, expect, it } from "vitest";
import { loadAiEnv } from "../src/config/env.js";
import { DraftingService } from "../src/drafting/drafting.service.js";
import { textModelClient } from "../src/providers/text-model.js";
import { typesafeClient } from "../src/providers/typesafe.js";
import { RoutingService } from "../src/routing/routing.service.js";
import { RuleActionService } from "../src/texts/rule-action.service.js";

const live = process.env.RUN_LIVE_AI_TESTS === "1";
if (live && existsSync(".env")) process.loadEnvFile(".env");

const PACK = new URL("../../../tools/sample-data/fixtures/small/", import.meta.url);
/** The check type an admin approves for each rule of the synthetic policy. */
const EXPECTED: Record<string, string> = {
  "R-01": "approver_min_grade",
  "R-02": "requester_not_approver",
  "R-03": "documents_present",
  "R-04": "approved_by_effective",
  "R-05": "max_count_in_window",
  "R-06": "required_field",
  "R-07": "text_judgment",
  "R-08": "submitted_within_after_effective",
  "R-09": "approver_is_manager",
  "R-10": "approvals_in_order",
  "R-11": "duplicate_transaction",
  "R-12": "tenure_minimum",
  "R-13": "subject_not_approver",
};

/** A dataset's transactions columns and vocabulary, read the way an upload reads them. */
function readData(
  transactions: Uint8Array,
  employees: Uint8Array,
): { columns: DraftColumn[]; vocabulary: Vocabulary } {
  const files = [readCsv(transactions), readCsv(employees)] as const;
  if (!files[0].ok || !files[1].ok) throw new Error("The CSV files can't be read");
  const input = { transactions: files[0].table, employees: files[1].table };
  const analysis = analyzeDataset(input);
  if (analysis.status === "rejected") throw new Error("The dataset is rejected");
  const dataset = datasetInputFromAnalysis(analysis, input);
  return {
    columns: dataset.columns
      .filter((column) => column.file === "transactions")
      .map(({ name, type, role }) => ({ name, type, role })),
    vocabulary: datasetVocabulary(prepareDataset(dataset)),
  };
}

async function draftPolicy(policy: string, data: ReturnType<typeof readData>) {
  const drafting = new DraftingService(typesafeClient(loadAiEnv()));
  const results = [];
  for (const rule of splitPolicy(policy).rules) {
    const { request, context } = aiDraftInput(rule.text, data.columns, data.vocabulary);
    const draft = composeAiDraft(await drafting.draft(request), context);
    results.push({
      id: rule.id,
      preset: draft?.preset ?? "(none fits)",
      confidence: draft ? Math.round(draft.confidence * 100) : null,
      weakest: draft?.weakest ?? null,
      values: JSON.stringify(draft?.values ?? null),
    });
  }
  console.table(results);
  return results;
}

describe.skipIf(!live)("live AI providers", () => {
  const read = (name: string) => readFileSync(new URL(name, PACK));

  it("drafts the synthetic policy into the check types an admin approves", async () => {
    const results = await draftPolicy(
      read("policy_rules.md").toString("utf8"),
      readData(read("transactions.csv"), read("employees.csv")),
    );
    const right = results.filter((result) => result.preset === EXPECTED[result.id]).length;
    expect(right).toBeGreaterThanOrEqual(11);
  }, 180_000);

  it("writes a suggested action whose numbers all come from the rule", async () => {
    const env = loadAiEnv();
    const text =
      "Allowance changes above AED 10,000 must be approved by at least one approver at Grade 10 or above.";
    const action = await new RuleActionService(textModelClient(env), env).write({
      ruleId: "R-01",
      title: "Approval of large allowance changes",
      text,
      referenceEn: "Get approval from an approver at the required grade, or reverse the change.",
    });
    console.log(action.en, "\n", action.ar);
    expect(unsupportedNumbers(`${action.en} ${action.ar}`, [text])).toEqual([]);
  }, 60_000);

  it("proposes an owner team per transaction type", async () => {
    const answer = await new RoutingService(typesafeClient(loadAiEnv())).propose({
      types: ["pay_change", "exit"],
      teams: ["Payroll Operations", "Employee Services", "Talent Acquisition"],
    });
    console.table(answer.owners);
    expect(answer.owners.find((owner) => owner.type === "pay_change")?.team).toBe(
      "Payroll Operations",
    );
  }, 60_000);

  it.skipIf(!process.env.LIVE_POLICY_FILE || !process.env.LIVE_DATA_DIR)(
    "drafts another policy, to look at (no assertions)",
    async () => {
      const dir = `${process.env.LIVE_DATA_DIR}/`;
      await draftPolicy(
        readFileSync(String(process.env.LIVE_POLICY_FILE), "utf8"),
        readData(readFileSync(`${dir}transactions.csv`), readFileSync(`${dir}employees.csv`)),
      );
    },
    600_000,
  );
});
