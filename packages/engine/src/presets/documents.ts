import { PRESET_CATALOGUE } from "@hrcc/shared";
import { appliesToTypes, built, Columns, listParam, rawList, roleName } from "./common.js";
import type { PresetDefinition } from "./types.js";

/** "Every exit needs a resignation letter and a clearance form": flags missing documents. */
export const documentsPresent: PresetDefinition = {
  id: "documents_present",
  checkKind: "structured",
  parameters: PRESET_CATALOGUE.documents_present.parameters,
  build(params, dataset) {
    const columns = new Columns(dataset);
    const documents = columns.role("transactions", "documents");
    return built(columns, appliesToTypes(params, columns), {
      ">": [{ count: [{ missing_from: [{ var: documents }, { param: "documents" }] }] }, 0],
    });
  },
  evidence(row) {
    const column = roleName(row, "documents") ?? "documents";
    const present = rawList(row, column);
    const missing = listParam(row.params, "documents").filter((item) => !present.includes(item));
    return [{ field: column, value: present, condition: `missing ${missing.join(", ")}` }];
  },
};
