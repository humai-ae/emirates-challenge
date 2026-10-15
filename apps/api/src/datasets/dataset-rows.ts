import type { DatasetAnalysis, StoredEmployeeRow, StoredTransactionRow } from "@hrcc/engine";
import type { DatasetFileKind } from "@hrcc/shared";
import type { EntityManager } from "typeorm";
import type { DatasetColumnEntity } from "../database/entities/index.js";

const FILE_KINDS: readonly DatasetFileKind[] = ["transactions", "employees"];
/** Rows per INSERT; each statement sends its rows as a single jsonb parameter. */
const CHUNK = 2_000;

export function storagePath(datasetId: string, kind: DatasetFileKind): string {
  return `${datasetId}/${kind}.csv`;
}

/** One entry per column: the role it plays and its profile. */
export function columnEntities(
  datasetId: string,
  analysis: DatasetAnalysis,
  confirmed: boolean,
): DatasetColumnEntity[] {
  return FILE_KINDS.flatMap((file) =>
    analysis.files[file].columns.map((profile) => {
      const assignment = analysis.roles[file].find((role) => role.columns.includes(profile.name));
      return {
        datasetId,
        file,
        position: profile.position,
        name: profile.name,
        type: profile.type,
        role: assignment?.role ?? null,
        roleConfident: assignment?.confident ?? false,
        roleConfirmed: confirmed,
        profile: {
          blankCount: profile.blankCount,
          distinctCount: profile.distinctCount,
          invalidCount: profile.invalidCount,
          samples: profile.samples,
          min: profile.min,
          max: profile.max,
          dateFormat: profile.dateFormat,
          dateAmbiguous: profile.dateAmbiguous,
          listDelimiter: profile.listDelimiter,
        },
      };
    }),
  );
}

function chunks<T>(items: readonly T[]): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += CHUNK) {
    result.push(items.slice(start, start + CHUNK));
  }
  return result;
}

export async function insertRows(
  manager: EntityManager,
  datasetId: string,
  rows: { transactions: StoredTransactionRow[]; employees: StoredEmployeeRow[] },
): Promise<void> {
  for (const chunk of chunks(rows.transactions)) {
    const records = chunk.map((row) => ({
      row_no: row.rowNo,
      transaction_id: row.transactionId,
      type: row.type,
      employee_id: row.employeeId,
      effective_date: row.effectiveDate,
      data: row.data,
    }));
    await manager.query(
      `INSERT INTO transactions (dataset_id, row_no, transaction_id, type, employee_id, effective_date, data)
       SELECT $1::uuid, r.row_no, r.transaction_id, r.type, r.employee_id, r.effective_date, r.data
       FROM jsonb_to_recordset($2::jsonb) AS r(
         row_no integer, transaction_id text, type text, employee_id text, effective_date date, data jsonb
       )`,
      [datasetId, JSON.stringify(records)],
    );
  }
  for (const chunk of chunks(rows.employees)) {
    const records = chunk.map((row) => ({
      row_no: row.rowNo,
      employee_id: row.employeeId,
      data: row.data,
    }));
    await manager.query(
      `INSERT INTO employees (dataset_id, row_no, employee_id, data)
       SELECT $1::uuid, r.row_no, r.employee_id, r.data
       FROM jsonb_to_recordset($2::jsonb) AS r(row_no integer, employee_id text, data jsonb)`,
      [datasetId, JSON.stringify(records)],
    );
  }
}

export async function deleteRows(manager: EntityManager, datasetId: string): Promise<void> {
  await manager.query("DELETE FROM transactions WHERE dataset_id = $1", [datasetId]);
  await manager.query("DELETE FROM employees WHERE dataset_id = $1", [datasetId]);
}
