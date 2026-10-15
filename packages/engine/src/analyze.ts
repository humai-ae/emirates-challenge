import type { DataIssue, DatasetFileKind, RejectionCode } from "@hrcc/shared";
import type { CsvTable } from "./csv.js";
import { parseDateValue } from "./dates.js";
import { type ColumnProfile, profileTable } from "./profile.js";
import { assignRoles, columnValues, type RoleAssignment, type RoleOverrides } from "./roles.js";

export interface FileAnalysis {
  kind: DatasetFileKind;
  header: string[];
  rowCount: number;
  delimiter: string;
  columns: ColumnProfile[];
  widthMismatches: number[];
  renamedHeaders: string[];
}

export interface DatasetAnalysis {
  status: "ready" | "rejected";
  rejection: RejectionCode | null;
  files: Record<DatasetFileKind, FileAnalysis>;
  roles: Record<DatasetFileKind, RoleAssignment[]>;
  issues: DataIssue[];
  summary: {
    transactionCount: number;
    employeeCount: number;
    periodFrom: string | null;
    periodTo: string | null;
  };
}

export interface AnalyzeInput {
  transactions: CsvTable;
  employees: CsvTable;
  /** The admin's confirmed mapping; when given, nothing is detected. */
  roles?: { transactions: RoleOverrides; employees: RoleOverrides };
}

export interface StoredTransactionRow {
  rowNo: number;
  transactionId: string | null;
  type: string | null;
  employeeId: string | null;
  effectiveDate: string | null;
  data: Record<string, string>;
}

export interface StoredEmployeeRow {
  rowNo: number;
  employeeId: string | null;
  data: Record<string, string>;
}

const FILE_KINDS: readonly DatasetFileKind[] = ["transactions", "employees"];
const IDENTIFIER_ROLE: Record<DatasetFileKind, string> = {
  transactions: "transaction_id",
  employees: "employee_id",
};
const BLANK_CHECKED: Record<DatasetFileKind, readonly string[]> = {
  transactions: [
    "transaction_id",
    "type",
    "employee_id",
    "requester_id",
    "approver_ids",
    "effective_date",
  ],
  employees: ["employee_id", "grade", "department"],
};
const EMPLOYEE_REFERENCES: Record<DatasetFileKind, readonly string[]> = {
  transactions: ["employee_id", "requester_id", "approver_ids"],
  employees: ["manager_id"],
};
const PARSED_TYPES = new Set(["integer", "number", "date", "datetime"]);
const DUBAI_OFFSET_MS = 4 * 3_600_000;

function find(assignments: readonly RoleAssignment[], role: string): RoleAssignment | undefined {
  return assignments.find((assignment) => assignment.role === role);
}

function profilesOf(file: FileAnalysis, assignment: RoleAssignment): ColumnProfile[] {
  return assignment.columns.flatMap((name) =>
    file.columns.filter((profile) => profile.name === name),
  );
}

/** A UTC ISO timestamp as the calendar date in Dubai. */
function dubaiDate(iso: string): string {
  return new Date(Date.parse(iso) + DUBAI_OFFSET_MS).toISOString().slice(0, 10);
}

function fileAnalysis(kind: DatasetFileKind, table: CsvTable): FileAnalysis {
  return {
    kind,
    header: table.header,
    rowCount: table.rows.length,
    delimiter: table.delimiter,
    columns: profileTable(table),
    widthMismatches: table.widthMismatches,
    renamedHeaders: table.renamedHeaders,
  };
}

function rowLabels(
  table: CsvTable,
  file: FileAnalysis,
  assignments: readonly RoleAssignment[],
): string[] {
  const identifier = find(assignments, IDENTIFIER_ROLE[file.kind]);
  const position = identifier ? profilesOf(file, identifier)[0]?.position : undefined;
  return table.rows.map((row, index) =>
    position !== undefined && row[position] ? (row[position] ?? "") : `#${index + 1}`,
  );
}

function fileIssues(
  table: CsvTable,
  file: FileAnalysis,
  assignments: readonly RoleAssignment[],
  employeeIds: ReadonlySet<string>,
): DataIssue[] {
  const issues: DataIssue[] = [];
  const kind = file.kind;
  if (file.widthMismatches.length > 0) {
    issues.push({
      code: "wrong_column_count",
      file: kind,
      column: null,
      role: null,
      count: file.widthMismatches.length,
      examples: file.widthMismatches.slice(0, 5).map((row) => `#${row}`),
    });
  }
  if (file.renamedHeaders.length > 0) {
    issues.push({
      code: "duplicate_header",
      file: kind,
      column: null,
      role: null,
      count: file.renamedHeaders.length,
      examples: file.renamedHeaders.slice(0, 5),
    });
  }
  const identifier = find(assignments, IDENTIFIER_ROLE[kind]);
  const identifierProfile = identifier ? profilesOf(file, identifier)[0] : undefined;
  if (identifier && identifierProfile) {
    const seen = new Set<string>();
    const duplicated = new Set<string>();
    for (const value of columnValues(table, identifierProfile)) {
      if (seen.has(value)) duplicated.add(value);
      seen.add(value);
    }
    if (duplicated.size > 0) {
      issues.push({
        code: "duplicate_id",
        file: kind,
        column: identifierProfile.name,
        role: identifier.role,
        count: duplicated.size,
        examples: [...duplicated].slice(0, 5),
      });
    }
  }
  const labels = rowLabels(table, file, assignments);
  for (const assignment of assignments) {
    const profiles = profilesOf(file, assignment);
    const column = assignment.columns.join(", ");
    if (BLANK_CHECKED[kind].includes(assignment.role)) {
      const blankRows = table.rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => profiles.every((profile) => (row[profile.position] ?? "") === ""));
      if (blankRows.length > 0) {
        issues.push({
          code: "blank_values",
          file: kind,
          column,
          role: assignment.role,
          count: blankRows.length,
          examples: blankRows.slice(0, 5).map(({ index }) => labels[index] ?? `#${index + 1}`),
        });
      }
    }
    if (EMPLOYEE_REFERENCES[kind].includes(assignment.role) && employeeIds.size > 0) {
      const unknown = [
        ...new Set(profiles.flatMap((profile) => columnValues(table, profile))),
      ].filter((value) => !employeeIds.has(value));
      if (unknown.length > 0) {
        issues.push({
          code: "unknown_employee",
          file: kind,
          column,
          role: assignment.role,
          count: unknown.length,
          examples: unknown.slice(0, 5),
        });
      }
    }
    for (const profile of profiles) {
      if (PARSED_TYPES.has(profile.type) && profile.invalidCount > 0) {
        issues.push({
          code: "invalid_values",
          file: kind,
          column: profile.name,
          role: assignment.role,
          count: profile.invalidCount,
          examples: profile.invalidExamples,
        });
      }
      if (profile.dateAmbiguous) {
        issues.push({
          code: "ambiguous_date_format",
          file: kind,
          column: profile.name,
          role: assignment.role,
          count: table.rows.length - profile.blankCount,
          examples: profile.samples,
        });
      }
    }
  }
  return issues;
}

function period(file: FileAnalysis, assignments: readonly RoleAssignment[]) {
  const effective = find(assignments, "effective_date");
  const profile = effective ? profilesOf(file, effective)[0] : undefined;
  if (!profile || typeof profile.min !== "string" || typeof profile.max !== "string") {
    return { periodFrom: null, periodTo: null };
  }
  if (profile.type === "datetime") {
    return { periodFrom: dubaiDate(profile.min), periodTo: dubaiDate(profile.max) };
  }
  return { periodFrom: profile.min, periodTo: profile.max };
}

export function analyzeDataset(input: AnalyzeInput): DatasetAnalysis {
  const files: Record<DatasetFileKind, FileAnalysis> = {
    transactions: fileAnalysis("transactions", input.transactions),
    employees: fileAnalysis("employees", input.employees),
  };
  const employeeRoles = assignRoles(
    "employees",
    input.employees,
    files.employees.columns,
    {},
    input.roles?.employees,
  );
  const employeeIdRole = find(employeeRoles, "employee_id");
  const employeeIdProfile = employeeIdRole
    ? profilesOf(files.employees, employeeIdRole)[0]
    : undefined;
  const employeeIds = new Set(
    employeeIdProfile ? columnValues(input.employees, employeeIdProfile) : [],
  );
  const transactionRoles = assignRoles(
    "transactions",
    input.transactions,
    files.transactions.columns,
    { employeeIds },
    input.roles?.transactions,
  );
  const roles = { transactions: transactionRoles, employees: employeeRoles };
  let rejection: RejectionCode | null = null;
  if (!find(transactionRoles, "transaction_id")) rejection = "no_transaction_id";
  else if (!employeeIdRole) rejection = "no_employee_id";
  const tables: Record<DatasetFileKind, CsvTable> = {
    transactions: input.transactions,
    employees: input.employees,
  };
  const issues = FILE_KINDS.flatMap((kind) =>
    fileIssues(tables[kind], files[kind], roles[kind], employeeIds),
  );
  return {
    status: rejection ? "rejected" : "ready",
    rejection,
    files,
    roles,
    issues,
    summary: {
      transactionCount: input.transactions.rows.length,
      employeeCount: input.employees.rows.length,
      ...period(files.transactions, transactionRoles),
    },
  };
}

function rowData(header: readonly string[], row: readonly string[]): Record<string, string> {
  return Object.fromEntries(header.map((name, index) => [name, row[index] ?? ""]));
}

export function rowsForStorage(
  analysis: DatasetAnalysis,
  input: AnalyzeInput,
): { transactions: StoredTransactionRow[]; employees: StoredEmployeeRow[] } {
  const column = (kind: DatasetFileKind, role: string): ColumnProfile | undefined => {
    const assignment = find(analysis.roles[kind], role);
    return assignment ? profilesOf(analysis.files[kind], assignment)[0] : undefined;
  };
  const read = (row: readonly string[], profile: ColumnProfile | undefined): string | null => {
    const value = profile ? (row[profile.position] ?? "") : "";
    return value === "" ? null : value;
  };
  const transactionId = column("transactions", "transaction_id");
  const type = column("transactions", "type");
  const employeeId = column("transactions", "employee_id");
  const effective = column("transactions", "effective_date");
  const effectiveDate = (row: readonly string[]): string | null => {
    const value = read(row, effective);
    if (!value || !effective?.dateFormat) return null;
    const parsed = parseDateValue(value, effective.dateFormat);
    if (!parsed) return null;
    return effective.type === "datetime" ? dubaiDate(parsed) : parsed;
  };
  const staffId = column("employees", "employee_id");
  return {
    transactions: input.transactions.rows.map((row, index) => ({
      rowNo: index + 1,
      transactionId: read(row, transactionId),
      type: read(row, type),
      employeeId: read(row, employeeId),
      effectiveDate: effectiveDate(row),
      data: rowData(input.transactions.header, row),
    })),
    employees: input.employees.rows.map((row, index) => ({
      rowNo: index + 1,
      employeeId: read(row, staffId),
      data: rowData(input.employees.header, row),
    })),
  };
}
