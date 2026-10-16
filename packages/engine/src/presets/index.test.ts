import { describe, expect, it } from "vitest";
import { param } from "../testing/checks.js";
import { dataset, TRANSACTION_COLUMNS, tx } from "../testing/dataset.js";
import { buildCheck, presetParameters } from "./index.js";

describe("buildCheck", () => {
  const data = dataset([tx()]);

  it("names parameters that are unknown, repeated, mistyped, missing or not a choice", () => {
    const mixed = [
      param("documents", "string[]", ["a"]),
      param("documents", "string[]", ["b"]),
      param("colour", "string", "red"),
      param("types", "number", 3),
    ];
    expect(buildCheck("documents_present", mixed, data)).toEqual({
      ok: false,
      reason: "parameters",
      issues: [
        { parameter: "documents", problem: "repeated" },
        { parameter: "colour", problem: "unknown" },
        { parameter: "types", problem: "wrong_type" },
      ],
    });
    expect(buildCheck("documents_present", [], data)).toEqual({
      ok: false,
      reason: "parameters",
      issues: [{ parameter: "documents", problem: "missing" }],
    });
    const notAChoice = [
      param("field", "column", "amount"),
      param("operator", "string", "~"),
      param("value", "number", 1),
    ];
    expect(buildCheck("field_compare", notAChoice, data)).toEqual({
      ok: false,
      reason: "parameters",
      issues: [{ parameter: "operator", problem: "not_a_choice" }],
    });
  });

  it("says which roles the data lacks", () => {
    const noDocuments = dataset([tx()], {
      columns: TRANSACTION_COLUMNS.filter((column) => column.role !== "documents"),
    });
    expect(
      buildCheck(
        "documents_present",
        [param("documents", "string[]", ["clearance_form"])],
        noDocuments,
      ),
    ).toEqual({
      ok: false,
      reason: "needs_data",
      needs: [{ file: "transactions", role: "documents" }],
    });
  });

  it("fills unset optional parameters and lists the fields used", () => {
    expect(
      buildCheck("documents_present", [param("documents", "string[]", ["clearance_form"])], data),
    ).toEqual({
      ok: true,
      check: {
        checkKind: "structured",
        preset: "documents_present",
        appliesTo: true,
        logic: {
          ">": [{ count: [{ missing_from: [{ var: "documents" }, { param: "documents" }] }] }, 0],
        },
        fieldsUsed: ["documents"],
        parameters: [
          param("types", "string[]", null),
          param("documents", "string[]", ["clearance_form"]),
          param("any_of", "string[]", null),
        ],
      },
    });
  });

  it("types plain values from the preset's parameters", () => {
    expect(
      presetParameters("documents_present", { documents: ["clearance_form"], colour: "red" }),
    ).toEqual([
      param("documents", "string[]", ["clearance_form"]),
      param("colour", "string", "red"),
    ]);
  });
});
