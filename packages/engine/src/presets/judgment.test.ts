import { PRESET_IDS } from "@hrcc/shared";
import { describe, expect, it } from "vitest";
import { runChecks } from "../evaluate.js";
import { check, param } from "../testing/checks.js";
import { dataset, tx } from "../testing/dataset.js";
import { PRESETS } from "./index.js";

describe("text_judgment", () => {
  it("flags a blank justification and leaves the others for AI", () => {
    const data = dataset([
      tx({ transaction_id: "TX-1", type: "pay_change", amount: "7000", justification: "" }),
      tx({
        transaction_id: "TX-2",
        type: "pay_change",
        amount: "7000",
        justification: "as discussed",
      }),
      tx({ transaction_id: "TX-3", type: "pay_change", amount: "3000", justification: "" }),
    ]);
    const built = check(data, "text_judgment", [
      param("types", "string[]", ["pay_change"]),
      param("text_field", "column", "justification"),
      param("amount_over", "number", 5000),
    ]);
    expect(built.checkKind).toBe("judgment");
    const [run] = runChecks(data, [{ ruleId: "R-07", version: 1, check: built }]);
    expect(run?.counts).toMatchObject({ flagged: 1, needs_judgment: 1, not_applicable: 1 });
    expect(run?.results.map((result) => [result.transactionId, result.outcome])).toEqual([
      ["TX-1", "flagged"],
      ["TX-2", "needs_judgment"],
    ]);
  });

  it("hands AI the text in the evidence of a transaction it must read", () => {
    const data = dataset([
      tx({
        transaction_id: "TX-2",
        type: "pay_change",
        amount: "7000",
        justification: "as discussed",
      }),
    ]);
    const built = check(data, "text_judgment", [
      param("types", "string[]", ["pay_change"]),
      param("text_field", "column", "justification"),
      param("amount_over", "number", 5000),
    ]);
    const [run] = runChecks(data, [{ ruleId: "R-07", version: 1, check: built }]);
    expect(run?.results[0]?.evidence).toEqual([
      { field: "amount", value: "7000", condition: "> 5000" },
      { field: "justification", value: "as discussed", condition: "read by AI against the rule" },
    ]);
  });
});

describe("PRESETS", () => {
  it("defines every preset the check format names", () => {
    expect([...PRESETS.keys()].sort()).toEqual([...PRESET_IDS].sort());
  });
});
