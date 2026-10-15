import {
  appliesToTypes,
  built,
  Columns,
  listParam,
  rawList,
  roleName,
  TYPES_PARAMETER,
} from "./common.js";
import type { PresetDefinition } from "./types.js";

/** "Every exit needs a resignation letter and a clearance form": flags missing documents. */
export const documentsPresent: PresetDefinition = {
  id: "documents_present",
  checkKind: "structured",
  parameters: [TYPES_PARAMETER, { name: "documents", type: "string[]" }],
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
