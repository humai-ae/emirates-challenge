import type { FindingFormat } from "@hrcc/shared";
import type { FindingFormatEntity } from "../database/entities/index.js";

export function toFindingFormat(format: FindingFormatEntity): FindingFormat {
  return {
    id: format.id,
    filename: format.filename,
    columns: format.columns,
    examples: format.examples,
    mapping: format.mapping,
    values: format.values,
    confirmedAt: format.confirmedAt?.toISOString() ?? null,
    confirmedBy: format.confirmedBy?.displayName ?? null,
    rowVersion: format.rowVersion,
    uploadedAt: format.createdAt.toISOString(),
    uploadedBy: format.uploadedBy.displayName,
  };
}
