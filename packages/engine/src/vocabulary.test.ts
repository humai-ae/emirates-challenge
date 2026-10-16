import { describe, expect, it } from "vitest";
import { dataset, TRANSACTION_COLUMNS, tx } from "./testing/dataset.js";
import { datasetVocabulary } from "./vocabulary.js";

describe("datasetVocabulary", () => {
  it("lists transaction types and document names, most frequent first", () => {
    const data = dataset([
      tx({ type: "exit", documents: "resignation_letter;clearance_form" }),
      tx({ type: "exit", documents: "resignation_letter" }),
      tx({ type: "pay_change", documents: "pay_change_form" }),
      tx({ type: "", documents: "" }),
    ]);
    expect(datasetVocabulary(data)).toEqual({
      types: ["exit", "pay_change"],
      documents: ["resignation_letter", "clearance_form", "pay_change_form"],
    });
  });

  it("is empty for a role no column plays, and keeps to the limit", () => {
    const columns = TRANSACTION_COLUMNS.filter((column) => column.role !== "documents");
    const data = dataset([tx({ type: "a" }), tx({ type: "b" }), tx({ type: "b" })], { columns });
    expect(datasetVocabulary(data, 1)).toEqual({ types: ["b"], documents: [] });
  });
});
