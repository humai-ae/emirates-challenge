import { type Expression, PRESET_CATALOGUE } from "@hrcc/shared";
import { appliesToTypes, built, Columns, optionalList, rawList, roleName } from "./common.js";
import type { PresetDefinition } from "./types.js";

/**
 * "Every exit needs a clearance form, and a resignation or a termination letter": flags a missing
 * document, or none of the alternatives.
 */
export const documentsPresent: PresetDefinition = {
  id: "documents_present",
  checkKind: "structured",
  parameters: PRESET_CATALOGUE.documents_present.parameters,
  build(params, dataset) {
    const columns = new Columns(dataset);
    const documents = columns.role("transactions", "documents");
    const missing = (name: string): Expression => ({
      count: [{ missing_from: [{ var: documents }, { param: name }] }],
    });
    const parts: Expression[] = [];
    if (params.get("documents") != null) parts.push({ ">": [missing("documents"), 0] });
    // None of the alternatives is there when every one of them is missing.
    if (params.get("any_of") != null) {
      parts.push({ "==": [missing("any_of"), { count: [{ param: "any_of" }] }] });
    }
    const [only] = parts;
    return built(
      columns,
      appliesToTypes(params, columns),
      parts.length === 1 && only !== undefined ? only : { or: parts },
    );
  },
  evidence(row) {
    const column = roleName(row, "documents") ?? "documents";
    const present = rawList(row, column);
    const alternatives = optionalList(row.params, "any_of");
    const missing = [
      ...optionalList(row.params, "documents").filter((item) => !present.includes(item)),
      ...(alternatives.length > 0 && !alternatives.some((item) => present.includes(item))
        ? [`one of ${alternatives.join(" / ")}`]
        : []),
    ];
    return [{ field: column, value: present, condition: `missing ${missing.join(", ")}` }];
  },
};
