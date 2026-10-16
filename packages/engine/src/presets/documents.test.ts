import { describe, expect, it } from "vitest";
import { check, evaluations, param } from "../testing/checks.js";
import { dataset, TRANSACTION_COLUMNS, tx } from "../testing/dataset.js";
import { buildCheck } from "./index.js";

describe("documents_present", () => {
  const parameters = [
    param("types", "string[]", ["exit"]),
    param("documents", "string[]", ["resignation_letter", "clearance_form"]),
  ];

  it("flags an exit missing a document, naming what is missing", () => {
    const data = dataset([
      tx({ type: "exit", documents: "resignation_letter" }),
      tx({ type: "exit", documents: "resignation_letter;clearance_form" }),
      tx({ type: "exit", documents: "" }),
      tx({ type: "transfer", documents: "" }),
    ]);
    const results = evaluations(data, check(data, "documents_present", parameters));
    expect(results.map((result) => result.outcome)).toEqual([
      "flagged",
      "passed",
      "flagged",
      "not_applicable",
    ]);
    expect(results[0]?.evidence).toEqual([
      { field: "documents", value: ["resignation_letter"], condition: "missing clearance_form" },
    ]);
    expect(results[2]?.evidence).toEqual([
      { field: "documents", value: [], condition: "missing resignation_letter, clearance_form" },
    ]);
  });

  it("reads documents written in a text column", () => {
    const columns = TRANSACTION_COLUMNS.map((column) =>
      column.name === "documents"
        ? { ...column, type: "text" as const, listDelimiter: null }
        : column,
    );
    const data = dataset([tx({ type: "exit", documents: "clearance_form | resignation_letter" })], {
      columns,
    });
    expect(evaluations(data, check(data, "documents_present", parameters))[0]?.outcome).toBe(
      "passed",
    );
  });
});

describe("documents_present with alternatives", () => {
  const parameters = [
    param("types", "string[]", ["exit"]),
    param("documents", "string[]", ["clearance_form"]),
    param("any_of", "string[]", ["resignation_letter", "termination_letter"]),
  ];

  it("needs every listed document and at least one alternative", () => {
    const data = dataset([
      tx({ type: "exit", documents: "resignation_letter;clearance_form" }),
      tx({ type: "exit", documents: "termination_letter;clearance_form" }),
      tx({ type: "exit", documents: "clearance_form" }),
      tx({ type: "exit", documents: "termination_letter" }),
    ]);
    const built = check(data, "documents_present", parameters);
    expect(built.logic).toEqual({
      or: [
        {
          ">": [{ count: [{ missing_from: [{ var: "documents" }, { param: "documents" }] }] }, 0],
        },
        {
          "==": [
            { count: [{ missing_from: [{ var: "documents" }, { param: "any_of" }] }] },
            { count: [{ param: "any_of" }] },
          ],
        },
      ],
    });
    const results = evaluations(data, built);
    expect(results.map((result) => result.outcome)).toEqual([
      "passed",
      "passed",
      "flagged",
      "flagged",
    ]);
    expect(results[2]?.evidence).toEqual([
      {
        field: "documents",
        value: ["clearance_form"],
        condition: "missing one of resignation_letter / termination_letter",
      },
    ]);
    expect(results[3]?.evidence).toEqual([
      { field: "documents", value: ["termination_letter"], condition: "missing clearance_form" },
    ]);
  });

  it("can take alternatives alone", () => {
    const data = dataset([tx({ documents: "offer_letter" }), tx({ documents: "" })]);
    const built = check(data, "documents_present", [
      param("any_of", "string[]", ["offer_letter", "contract"]),
    ]);
    expect(evaluations(data, built).map((result) => result.outcome)).toEqual(["passed", "flagged"]);
  });

  it("needs documents or alternatives", () => {
    expect(
      buildCheck("documents_present", [param("types", "string[]", ["exit"])], dataset([tx()])),
    ).toEqual({
      ok: false,
      reason: "parameters",
      issues: [{ parameter: "documents", problem: "missing" }],
    });
  });
});
