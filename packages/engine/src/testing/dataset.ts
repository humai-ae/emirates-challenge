import type { ColumnType, DatasetFileKind } from "@hrcc/shared";
import { type CsvTable, readCsv } from "../csv.js";
import { type ColumnSpec, PreparedDataset } from "../dataset.js";
import type { DateFormat } from "../dates.js";
import type { WorkCalendar } from "../values.js";

/** A CSV written inline in a test, read the way an upload is. */
export function table(csv: string): CsvTable {
  const result = readCsv(new TextEncoder().encode(csv));
  if (!result.ok) throw new Error(`Test CSV unreadable: ${result.reason}`);
  return result.table;
}

/** Rows of an inline CSV by column name. */
export function records(csv: string): Array<Record<string, string>> {
  const { header, rows } = table(csv);
  return rows.map((row) =>
    Object.fromEntries(header.map((name, index) => [name, row[index] ?? ""])),
  );
}

type ColumnEntry = readonly [name: string, type: ColumnType, role?: string];

const DATE_FORMATS: Partial<Record<ColumnType, DateFormat>> = {
  date: "YYYY-MM-DD",
  datetime: "YYYY-MM-DD HH:mm",
};

/** Column specs in file order, with the formats the sample files use. */
export function columns(file: DatasetFileKind, entries: readonly ColumnEntry[]): ColumnSpec[] {
  return entries.map(([name, type, role], position) => ({
    file,
    name,
    position,
    type,
    role: role ?? null,
    dateFormat: DATE_FORMATS[type] ?? null,
    listDelimiter: type === "list" ? ";" : null,
  }));
}

export const TRANSACTION_COLUMNS = columns("transactions", [
  ["transaction_id", "id", "transaction_id"],
  ["type", "category", "type"],
  ["employee_id", "id", "employee_id"],
  ["amount", "integer", "amount"],
  ["effective_date", "date", "effective_date"],
  ["requester_id", "id", "requester_id"],
  ["approver_1_id", "id", "approver_ids"],
  ["approver_2_id", "id", "approver_ids"],
  ["submitted_at", "datetime", "submitted_at"],
  ["approved_at", "datetime", "approved_at"],
  ["documents", "list", "documents"],
  ["justification", "text", "text"],
]);

export const EMPLOYEE_COLUMNS = columns("employees", [
  ["employee_id", "id", "employee_id"],
  ["grade", "integer", "grade"],
  ["department", "category", "department"],
  ["manager_id", "id", "manager_id"],
]);

/** Eight people: E-0001 → E-0002 → E-0003 → E-0004 is one reporting line. E-0008 has no grade. */
export const EMPLOYEES = `employee_id,grade,department,manager_id
E-0001,15,Executive Office,
E-0002,12,Finance,E-0001
E-0003,9,Finance,E-0002
E-0004,7,Finance,E-0003
E-0005,10,Cabin Services,E-0001
E-0006,6,Cabin Services,E-0005
E-0007,8,Cabin Services,E-0006
E-0008,,Cabin Services,E-0005
`;

/**
 * An allowance change of 12,000 for E-0004, requested by their manager E-0003, approved by E-0002
 * (grade 12) before it took effect. Tests change only what they are about.
 */
const DEFAULT_ROW: Readonly<Record<string, string>> = {
  transaction_id: "TX-1",
  type: "allowance_change",
  employee_id: "E-0004",
  amount: "12000",
  effective_date: "2025-03-01",
  requester_id: "E-0003",
  approver_1_id: "E-0002",
  approver_2_id: "",
  submitted_at: "2025-02-20 09:10",
  approved_at: "2025-02-25 11:00",
  documents: "allowance_form",
  justification: "Market adjustment",
};

export function tx(values: Record<string, string> = {}): Record<string, string> {
  return { ...DEFAULT_ROW, ...values };
}

export function dataset(
  rows: ReadonlyArray<Record<string, string>>,
  options: { columns?: readonly ColumnSpec[]; employees?: string; calendar?: WorkCalendar } = {},
): PreparedDataset {
  return new PreparedDataset(
    {
      columns: [...(options.columns ?? TRANSACTION_COLUMNS), ...EMPLOYEE_COLUMNS],
      transactions: rows,
      employees: records(options.employees ?? EMPLOYEES),
    },
    { calendar: options.calendar },
  );
}
