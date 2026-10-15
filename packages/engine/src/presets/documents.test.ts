import { describe, expect, it } from "vitest";
import { check, evaluations, param } from "../testing/checks.js";
import { dataset, TRANSACTION_COLUMNS, tx } from "../testing/dataset.js";

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
