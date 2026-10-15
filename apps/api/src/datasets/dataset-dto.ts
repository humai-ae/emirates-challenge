import type { DatasetDetail, DatasetFileKind, DatasetSummary } from "@hrcc/shared";
import type {
  DatasetColumnEntity,
  DatasetEntity,
  DatasetFileEntity,
} from "../database/entities/index.js";

const FILE_ORDER: Record<DatasetFileKind, number> = { transactions: 0, employees: 1 };

/** `dataset.createdBy` must be loaded. */
export function toDatasetSummary(dataset: DatasetEntity): DatasetSummary {
  return {
    id: dataset.id,
    name: dataset.name,
    status: dataset.status,
    rejection: dataset.rejection,
    transactionCount: dataset.transactionCount,
    employeeCount: dataset.employeeCount,
    periodFrom: dataset.periodFrom,
    periodTo: dataset.periodTo,
    issueCount: dataset.issues.length,
    columnsConfirmed: dataset.columnsConfirmed,
    createdAt: dataset.createdAt.toISOString(),
    createdBy: dataset.createdBy.displayName,
  };
}

export function toDatasetDetail(
  dataset: DatasetEntity,
  files: readonly DatasetFileEntity[],
  columns: readonly DatasetColumnEntity[],
): DatasetDetail {
  return {
    ...toDatasetSummary(dataset),
    files: [...files]
      .sort((a, b) => FILE_ORDER[a.kind] - FILE_ORDER[b.kind])
      .map((file) => ({
        kind: file.kind,
        filename: file.filename,
        sizeBytes: file.sizeBytes,
        sha256: file.sha256,
      })),
    columns: [...columns]
      .sort((a, b) => FILE_ORDER[a.file] - FILE_ORDER[b.file] || a.position - b.position)
      .map((column) => ({
        file: column.file,
        name: column.name,
        position: column.position,
        type: column.type,
        role: column.role,
        roleConfident: column.roleConfident,
        roleConfirmed: column.roleConfirmed,
        ...column.profile,
      })),
    issues: dataset.issues,
  };
}
