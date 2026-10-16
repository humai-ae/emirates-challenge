import { describe, expect, it } from "vitest";
import {
  CHECK_OPERATORS,
  CheckSchema,
  EvidenceSchema,
  MissingFieldSchema,
  PARAMETER_TYPES,
  ParameterSchema,
  PRESET_IDS,
} from "./index.js";

const check = {
  checkKind: "structured",
  preset: "approver_min_grade",
  appliesTo: { in: [{ var: "type" }, { param: "types" }] },
  logic: {
    and: [
      { ">": [{ var: "amount" }, { param: "amount_limit" }] },
      {
        none: [
          { var: "approvers[].grade" },
          { ">=": [{ var: "" }, { param: "min_approver_grade" }] },
        ],
      },
    ],
  },
  fieldsUsed: ["amount", "approvers[].grade", "type"],
  parameters: [
    { name: "types", type: "string[]", value: ["allowance_change"], editedByAdmin: false },
    { name: "amount_limit", type: "number", value: 10000, editedByAdmin: false },
    { name: "min_approver_grade", type: "integer", value: 10, editedByAdmin: true },
  ],
};

describe("checks", () => {
  it("lists the operators a check may use", () => {
    expect(CHECK_OPERATORS).toHaveLength(32);
    expect(CHECK_OPERATORS).toContain("history_count");
    expect(CHECK_OPERATORS).toContain("in_order");
    expect(CHECK_OPERATORS).not.toContain("regex");
    expect(PARAMETER_TYPES).toContain("column");
  });

  it("accepts a check made of data", () => {
    expect(CheckSchema.safeParse(check).success).toBe(true);
    expect(PRESET_IDS).toContain(check.preset);
  });

  it("refuses unknown keys, unknown presets and values that are not JSON", () => {
    expect(CheckSchema.safeParse({ ...check, code: "return 1" }).success).toBe(false);
    expect(CheckSchema.safeParse({ ...check, preset: "custom_code" }).success).toBe(false);
    expect(CheckSchema.safeParse({ ...check, logic: Number.NaN }).success).toBe(false);
    expect(CheckSchema.safeParse({ ...check, logic: () => true }).success).toBe(false);
  });

  it("keeps judgment checks and the judgment preset together", () => {
    const mixed = CheckSchema.safeParse({ ...check, checkKind: "judgment" });
    expect(mixed.success).toBe(false);
    expect(mixed.error?.issues[0]?.message).toBe("check_kind_mismatch");
    expect(
      CheckSchema.safeParse({ ...check, checkKind: "judgment", preset: "text_judgment" }).success,
    ).toBe(true);
  });

  it("checks a parameter's value against its type", () => {
    const parameter = {
      name: "min_approver_grade",
      type: "integer",
      value: 10,
      editedByAdmin: false,
    };
    expect(ParameterSchema.safeParse(parameter).success).toBe(true);
    expect(ParameterSchema.safeParse({ ...parameter, value: null }).success).toBe(true);
    expect(ParameterSchema.safeParse({ ...parameter, value: 10.5 }).success).toBe(false);
    expect(ParameterSchema.safeParse({ ...parameter, type: "string[]", value: [] }).success).toBe(
      false,
    );
    expect(ParameterSchema.safeParse({ ...parameter, type: "column", value: " " }).success).toBe(
      false,
    );
    expect(ParameterSchema.safeParse({ ...parameter, name: "Min Grade" }).success).toBe(false);
  });

  it("describes evidence and missing fields", () => {
    expect(
      EvidenceSchema.safeParse({ field: "amount", value: "16200", condition: "> 10000" }).success,
    ).toBe(true);
    expect(
      EvidenceSchema.safeParse({
        field: "approvers[].grade",
        value: ["8"],
        condition: "none >= 10",
      }).success,
    ).toBe(true);
    expect(
      MissingFieldSchema.safeParse({ field: "approver_2_id", reason: "not_found", value: "E-9003" })
        .success,
    ).toBe(true);
    expect(MissingFieldSchema.safeParse({ field: "amount", reason: "unknown" }).success).toBe(
      false,
    );
  });
});
