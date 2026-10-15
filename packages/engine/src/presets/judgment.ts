import type { Expression } from "@hrcc/shared";
import {
  amountOver,
  appliesToTypes,
  built,
  Columns,
  optionalNumber,
  rawOf,
  TYPES_PARAMETER,
  textParam,
} from "./common.js";
import type { PresetDefinition } from "./types.js";

/**
 * "Justifications for pay changes above AED 5,000 must give a clear business reason." AI reads the
 * text. Code decides only that a blank text breaks the rule; every other transaction the rule
 * applies to needs judgment.
 */
export const textJudgment: PresetDefinition = {
  id: "text_judgment",
  checkKind: "judgment",
  parameters: [
    TYPES_PARAMETER,
    { name: "text_field", type: "column" },
    { name: "amount_over", type: "number", optional: true, min: 0 },
  ],
  build(params, dataset) {
    const columns = new Columns(dataset);
    const types = appliesToTypes(params, columns);
    // Only texts the rule is about go to AI, so the threshold limits where the rule applies.
    const appliesTo: Expression =
      optionalNumber(params, "amount_over") === null
        ? types
        : {
            and: [
              types,
              { ">": [{ var: columns.role("transactions", "amount") }, { param: "amount_over" }] },
            ],
          };
    return built(columns, appliesTo, { is_blank: { var: textParam(params, "text_field") } });
  },
  evidence(row) {
    const field = textParam(row.params, "text_field");
    return [...amountOver(row), { field, value: rawOf(row, field), condition: "is blank" }];
  },
};
