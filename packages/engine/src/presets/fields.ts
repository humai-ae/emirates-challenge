import type { Expression } from "@hrcc/shared";
import { PRESET_CATALOGUE } from "@hrcc/shared";
import {
  amountOver,
  appliesToTypes,
  built,
  Columns,
  numberOf,
  numberParam,
  optionalNumber,
  rawOf,
  roleName,
  textParam,
} from "./common.js";
import type { PresetDefinition } from "./types.js";

/** "Overtime above AED 5,000 is not allowed": flags a number field that meets a comparison. */
export const fieldCompare: PresetDefinition = {
  id: "field_compare",
  checkKind: "structured",
  parameters: PRESET_CATALOGUE.field_compare.parameters,
  build(params, dataset) {
    const columns = new Columns(dataset);
    return built(columns, appliesToTypes(params, columns), {
      [textParam(params, "operator")]: [{ var: textParam(params, "field") }, { param: "value" }],
    });
  },
  evidence(row) {
    const field = textParam(row.params, "field");
    const condition = `${textParam(row.params, "operator")} ${numberParam(row.params, "value")}`;
    return [{ field, value: rawOf(row, field), condition }];
  },
  nearMiss(row) {
    const field = textParam(row.params, "field");
    const operator = textParam(row.params, "operator");
    const limit = numberParam(row.params, "value");
    const value = numberOf(row, field);
    if (value === null || limit <= 0) return null;
    // Within a tenth of the limit, on the side that passes.
    if ((operator === ">" || operator === ">=") && value <= limit && value >= limit * 0.9) {
      return {
        reason: "value_just_under_limit",
        facts: [{ field, value: rawOf(row, field), condition: `<= ${limit}` }],
      };
    }
    if ((operator === "<" || operator === "<=") && value >= limit && value <= limit * 1.1) {
      return {
        reason: "value_just_over_limit",
        facts: [{ field, value: rawOf(row, field), condition: `>= ${limit}` }],
      };
    }
    return null;
  },
};

/**
 * "Pay changes above AED 5,000 must include a justification": flags a blank field, optionally only
 * above an amount.
 */
export const requiredField: PresetDefinition = {
  id: "required_field",
  checkKind: "structured",
  parameters: PRESET_CATALOGUE.required_field.parameters,
  build(params, dataset) {
    const columns = new Columns(dataset);
    const blank = { is_blank: { var: textParam(params, "field") } };
    const logic: Expression =
      optionalNumber(params, "amount_over") === null
        ? blank
        : {
            and: [
              { ">": [{ var: columns.role("transactions", "amount") }, { param: "amount_over" }] },
              blank,
            ],
          };
    return built(columns, appliesToTypes(params, columns), logic);
  },
  evidence(row) {
    const field = textParam(row.params, "field");
    return [...amountOver(row), { field, value: rawOf(row, field), condition: "is blank" }];
  },
  nearMiss(row) {
    const threshold = optionalNumber(row.params, "amount_over");
    const amountColumn = roleName(row, "amount");
    const field = textParam(row.params, "field");
    if (threshold === null || !amountColumn || rawOf(row, field) !== "") return null;
    const amount = numberOf(row, amountColumn);
    if (amount === null || amount > threshold || amount < threshold * 0.9) return null;
    return {
      reason: "amount_just_under_threshold",
      facts: [
        { field: amountColumn, value: rawOf(row, amountColumn), condition: `<= ${threshold}` },
        { field, value: "", condition: "is blank" },
      ],
    };
  },
};
