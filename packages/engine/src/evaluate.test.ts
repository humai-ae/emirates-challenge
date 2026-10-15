import type { Check } from "@hrcc/shared";
import { describe, expect, it } from "vitest";
import { InvalidCheckError, runChecks } from "./evaluate.js";
import { check, param } from "./testing/checks.js";
import { dataset, tx } from "./testing/dataset.js";

const exitDocuments = [
  param("types", "string[]", ["exit"]),
  param("documents", "string[]", ["resignation_letter", "clearance_form"]),
];

describe("runChecks", () => {
  it("counts every outcome and keeps flags and could-not-checks in file order", () => {
    const data = dataset([
      tx({ transaction_id: "TX-1", type: "exit", documents: "" }),
      tx({ transaction_id: "TX-2", type: "exit", documents: "resignation_letter;clearance_form" }),
      tx({ transaction_id: "TX-3", type: "transfer" }),
      tx({ transaction_id: "TX-4", type: "" }),
    ]);
    const built = check(data, "documents_present", exitDocuments);
    const [run] = runChecks(data, [{ ruleId: "R-03", version: 2, check: built }]);
    expect(run).toMatchObject({ ruleId: "R-03", version: 2 });
    expect(run?.counts).toEqual({
      not_applicable: 1,
      passed: 1,
      flagged: 1,
      could_not_check: 1,
      needs_judgment: 0,
    });
    expect(
      run?.results.map((result) => [result.rowNo, result.transactionId, result.outcome]),
    ).toEqual([
      [1, "TX-1", "flagged"],
      [4, "TX-4", "could_not_check"],
    ]);
    expect(run?.results[1]?.missing).toEqual([{ field: "type", reason: "blank" }]);
  });

  it("turns a mistake on one row into could-not-check and carries on", () => {
    const data = dataset([tx({ transaction_id: "TX-1" }), tx({ transaction_id: "TX-2" })]);
    const odd: Check = {
      checkKind: "structured",
      preset: "field_compare",
      appliesTo: true,
      logic: { "==": [{ hour_of: { var: "effective_date" } }, 9] },
      fieldsUsed: ["effective_date"],
      parameters: [],
    };
    const fine = check(data, "documents_present", [
      param("documents", "string[]", ["allowance_form"]),
    ]);
    const [broken, working] = runChecks(data, [
      { ruleId: "R-90", version: 1, check: odd },
      { ruleId: "R-91", version: 1, check: fine },
    ]);
    expect(broken?.counts.could_not_check).toBe(2);
    expect(broken?.results[0]?.error).toBe("hour_of needs a date with a time");
    expect(working?.counts.passed).toBe(2);
  });

  it("refuses a check that can't run, before reading any row", () => {
    const data = dataset([tx()]);
    const bad = { ...check(data, "documents_present", exitDocuments), logic: { regex: ["x"] } };
    expect(() => runChecks(data, [{ ruleId: "R-03", version: 1, check: bad }])).toThrow(
      InvalidCheckError,
    );
  });

  it("gives the same results every time", () => {
    const data = dataset([
      tx({ transaction_id: "TX-1", type: "exit", documents: "" }),
      tx({ transaction_id: "TX-2" }),
    ]);
    const rules = [
      { ruleId: "R-03", version: 1, check: check(data, "documents_present", exitDocuments) },
    ];
    expect(runChecks(data, rules)).toEqual(runChecks(data, rules));
  });
});
