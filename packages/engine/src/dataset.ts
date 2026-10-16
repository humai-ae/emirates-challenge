import { DATASET_FILE_KINDS, type DatasetFileKind, type MissingField } from "@hrcc/shared";
import { type AnalyzeInput, type DatasetAnalysis, rowsForStorage } from "./analyze.js";
import { nameTokens } from "./profile.js";
import {
  type CellFormat,
  type CellValue,
  compareDates,
  DateValue,
  DEFAULT_CALENDAR,
  readCell,
  splitList,
  type WorkCalendar,
} from "./values.js";

/** How the engine reads one column, and the role the column plays. */
export interface ColumnSpec extends CellFormat {
  file: DatasetFileKind;
  name: string;
  position: number;
  role: string | null;
}

type Cells = Readonly<Record<string, string>>;

/** A dataset as checks need it: its columns, and every row by the file's own column names. */
export interface DatasetInput {
  columns: readonly ColumnSpec[];
  transactions: readonly Cells[];
  employees: readonly Cells[];
}

/** The input for a dataset an upload analysed, with the roles the analysis settled on. */
export function datasetInputFromAnalysis(
  analysis: DatasetAnalysis,
  input: AnalyzeInput,
): DatasetInput {
  const columns = DATASET_FILE_KINDS.flatMap((file) =>
    analysis.files[file].columns.map(
      (profile): ColumnSpec => ({
        file,
        name: profile.name,
        position: profile.position,
        type: profile.type,
        dateFormat: profile.dateFormat,
        listDelimiter: profile.listDelimiter,
        role:
          analysis.roles[file].find((assignment) => assignment.columns.includes(profile.name))
            ?.role ?? null,
      }),
    ),
  );
  const rows = rowsForStorage(analysis, input);
  return {
    columns,
    transactions: rows.transactions.map((row) => row.data),
    employees: rows.employees.map((row) => row.data),
  };
}

/** Where a field name in a check points. */
export type FieldPath =
  | { kind: "column"; column: ColumnSpec }
  | { kind: "person"; via: "employee" | "requester"; key: ColumnSpec; column: ColumnSpec }
  | { kind: "approver_ids"; keys: readonly ColumnSpec[] }
  | { kind: "approvers"; keys: readonly ColumnSpec[]; column: ColumnSpec }
  | { kind: "approval_times"; keys: readonly ColumnSpec[] }
  | { kind: "first_approver"; keys: readonly ColumnSpec[] };

export type PathResult =
  | { ok: true; path: FieldPath }
  | { ok: false; problem: "unknown_field" | "missing_role"; detail: string };

export type ResolvedItem =
  | { kind: "value"; value: CellValue; raw: string }
  | { kind: "missing"; missing: readonly MissingField[] };

/** A field of one transaction: a value, one value per approver, or what is missing. */
export type Resolved = ResolvedItem | { kind: "list"; items: readonly ResolvedItem[] };

export interface TransactionRow {
  /** 0-based position in the file. */
  index: number;
  /** 1-based row number, as people count rows. */
  rowNo: number;
  transactionId: string | null;
  cells: Cells;
}

export interface HistoryEntry {
  index: number;
  day: number;
  type: string | null;
  transactionId: string | null;
}

const APPROVERS = "approvers[]";
/** Each approval's time, as a list: see `PreparedDataset.approvalTimes`. */
export const APPROVAL_TIMES = "approval_times[]";
/** The first approver listed: the first filled approver column, or a list column's first ID. */
export const FIRST_APPROVER = "approvers[0]";
/** Roles whose columns hold IDs. */
const ID_ROLES: ReadonlySet<string> = new Set([
  "transaction_id",
  "employee_id",
  "requester_id",
  "approver_ids",
  "manager_id",
]);
const PERSON_ROLES = { employee: "employee_id", requester: "requester_id" } as const;

/** The number in a column name: "approver_2_at" → "2". */
function numberIn(name: string): string | null {
  return nameTokens(name).find((token) => /^\d+$/.test(token)) ?? null;
}

function missing(field: string, reason: MissingField["reason"], value?: string): ResolvedItem {
  return {
    kind: "missing",
    missing: [value === undefined ? { field, reason } : { field, reason, value }],
  };
}

/**
 * IDs are read as text even when they hold only digits, so "0031" stays "0031" and matches the
 * other file. A list column of approver IDs keeps its delimiter.
 */
function asRead(column: ColumnSpec): ColumnSpec {
  if (!ID_ROLES.has(column.role ?? "") || column.type === "list" || column.type === "id") {
    return column;
  }
  return { ...column, type: "id", dateFormat: null };
}

function read(cells: Cells, column: ColumnSpec, label: string): ResolvedItem {
  const raw = (cells[column.name] ?? "").trim();
  const cell = readCell(raw, column);
  return cell.ok ? { kind: "value", value: cell.value, raw } : missing(label, cell.reason);
}

/**
 * A dataset ready for checks: rows by position, employees by ID, and the joins, manager chains
 * and per-person histories checks look up. Lookups are cached; results never depend on the order
 * of lookups.
 */
export class PreparedDataset {
  readonly rows: readonly TransactionRow[];
  readonly calendar: WorkCalendar;
  private readonly columns: Record<DatasetFileKind, ReadonlyMap<string, ColumnSpec>>;
  private readonly employeesById = new Map<string, Cells>();
  private readonly paths = new Map<string, PathResult>();
  private readonly chains = new Map<string, readonly string[] | null>();
  private readonly histories = new Map<string, ReadonlyMap<string, readonly HistoryEntry[]>>();

  constructor(input: DatasetInput, options: { calendar?: WorkCalendar } = {}) {
    this.calendar = options.calendar ?? DEFAULT_CALENDAR;
    const byFile = (file: DatasetFileKind) =>
      new Map(
        input.columns
          .filter((column) => column.file === file)
          .sort((a, b) => a.position - b.position)
          .map((column) => [column.name, asRead(column)] as const),
      );
    this.columns = { transactions: byFile("transactions"), employees: byFile("employees") };
    const idColumn = this.roleColumn("transactions", "transaction_id");
    this.rows = input.transactions.map((cells, index) => ({
      index,
      rowNo: index + 1,
      transactionId: (idColumn && cells[idColumn.name]?.trim()) || null,
      cells,
    }));
    const staffId = this.roleColumn("employees", "employee_id");
    if (staffId) {
      for (const row of input.employees) {
        const id = row[staffId.name]?.trim();
        // A repeated ID keeps its first row; the upload lists repeats as a data issue.
        if (id && !this.employeesById.has(id)) this.employeesById.set(id, row);
      }
    }
  }

  /** A file's column names, in file order. */
  columnNames(file: DatasetFileKind): string[] {
    return [...this.columns[file].keys()];
  }

  column(file: DatasetFileKind, name: string): ColumnSpec | undefined {
    return this.columns[file].get(name);
  }

  /** The columns playing a role, in file order. */
  roleColumns(file: DatasetFileKind, role: string): ColumnSpec[] {
    return [...this.columns[file].values()].filter((column) => column.role === role);
  }

  roleColumn(file: DatasetFileKind, role: string): ColumnSpec | undefined {
    return this.roleColumns(file, role)[0];
  }

  /** What a field name in a check refers to. */
  parsePath(name: string): PathResult {
    const known = this.paths.get(name);
    if (known) return known;
    const result = this.parse(name);
    this.paths.set(name, result);
    return result;
  }

  private parse(name: string): PathResult {
    const direct = this.column("transactions", name);
    if (direct) return { ok: true, path: { kind: "column", column: direct } };
    if (name === APPROVAL_TIMES) {
      const keys = this.roleColumns("transactions", "approved_at");
      if (keys.length === 0) {
        return { ok: false, problem: "missing_role", detail: "transactions: approved_at" };
      }
      return { ok: true, path: { kind: "approval_times", keys } };
    }
    if (name === FIRST_APPROVER) {
      const keys = this.roleColumns("transactions", "approver_ids");
      if (keys.length === 0) {
        return { ok: false, problem: "missing_role", detail: "transactions: approver_ids" };
      }
      return { ok: true, path: { kind: "first_approver", keys } };
    }
    if (name === APPROVERS || name.startsWith(`${APPROVERS}.`)) {
      const keys = this.roleColumns("transactions", "approver_ids");
      if (keys.length === 0) {
        return { ok: false, problem: "missing_role", detail: "transactions: approver_ids" };
      }
      if (name === APPROVERS) return { ok: true, path: { kind: "approver_ids", keys } };
      const column = this.column("employees", name.slice(APPROVERS.length + 1));
      if (!column) return { ok: false, problem: "unknown_field", detail: name };
      return { ok: true, path: { kind: "approvers", keys, column } };
    }
    for (const via of ["employee", "requester"] as const) {
      if (!name.startsWith(`${via}.`)) continue;
      const key = this.roleColumn("transactions", PERSON_ROLES[via]);
      if (!key) {
        return { ok: false, problem: "missing_role", detail: `transactions: ${PERSON_ROLES[via]}` };
      }
      const column = this.column("employees", name.slice(via.length + 1));
      if (!column) return { ok: false, problem: "unknown_field", detail: name };
      return { ok: true, path: { kind: "person", via, key, column } };
    }
    return { ok: false, problem: "unknown_field", detail: name };
  }

  /** A field of one transaction, read as its column's type. */
  resolve(index: number, path: FieldPath): Resolved {
    const cells = this.rows[index]?.cells ?? {};
    switch (path.kind) {
      case "column":
        return read(cells, path.column, path.column.name);
      case "person": {
        const id = (cells[path.key.name] ?? "").trim();
        if (id === "") return missing(path.key.name, "blank");
        const employee = this.employeesById.get(id);
        if (!employee) return missing(path.key.name, "not_found", id);
        return read(employee, path.column, `${path.via}.${path.column.name}`);
      }
      case "approval_times": {
        const times = this.approvalTimes(index);
        if (times.length === 0) {
          return {
            kind: "missing",
            missing: path.keys.map((key) => ({ field: key.name, reason: "blank" as const })),
          };
        }
        return { kind: "list", items: times.map((time) => time.item) };
      }
      case "first_approver": {
        const [first] = this.approverIds(index);
        if (!first) {
          return {
            kind: "missing",
            missing: path.keys.map((key) => ({ field: key.name, reason: "blank" as const })),
          };
        }
        return { kind: "value", value: first.id, raw: first.id };
      }
      case "approver_ids":
      case "approvers": {
        const approvers = this.approverIds(index);
        if (approvers.length === 0) {
          return {
            kind: "missing",
            missing: path.keys.map((key) => ({ field: key.name, reason: "blank" as const })),
          };
        }
        if (path.kind === "approver_ids") {
          return {
            kind: "list",
            items: approvers.map(({ id }) => ({ kind: "value", value: id, raw: id }) as const),
          };
        }
        const column = path.column;
        return {
          kind: "list",
          items: approvers.map(({ id, key }) => {
            const employee = this.employeesById.get(id);
            if (!employee) return missing(key.name, "not_found", id);
            return read(employee, column, `${APPROVERS}.${column.name}`);
          }),
        };
      }
    }
  }

  /** A field by its name in a check; the name must be one `parsePath` accepts. */
  field(index: number, name: string): Resolved {
    const parsed = this.parsePath(name);
    if (!parsed.ok) throw new Error(`Unknown field ${name}: ${parsed.detail}`);
    return this.resolve(index, parsed.path);
  }

  /** Each approver's ID with the column it came from, in column order. */
  approverIds(index: number): Array<{ id: string; key: ColumnSpec }> {
    const cells = this.rows[index]?.cells ?? {};
    return this.roleColumns("transactions", "approver_ids").flatMap((key) =>
      // IDs never contain ; or |, so a cell with several IDs splits safely whatever its type.
      splitList(cells[key.name] ?? "", key.type === "list" ? key.listDelimiter : null).map(
        (id) => ({ id, key }),
      ),
    );
  }

  /**
   * Each approval's time, in column order. One time column is the transaction's approval time.
   * Several pair by number with the approver columns (approver_2_at with approver_2_id): a pair
   * with neither filled is left out, and an approver listed without a time is missing.
   */
  approvalTimes(index: number): Array<{ key: ColumnSpec; item: ResolvedItem }> {
    const cells = this.rows[index]?.cells ?? {};
    const keys = this.roleColumns("transactions", "approved_at");
    if (keys.length === 1) return keys.map((key) => ({ key, item: read(cells, key, key.name) }));
    const approvers = this.roleColumns("transactions", "approver_ids");
    const filled = (column: ColumnSpec | undefined) =>
      column !== undefined && (cells[column.name] ?? "").trim() !== "";
    return keys.flatMap((key) => {
      const number = numberIn(key.name);
      const partner =
        number === null ? undefined : approvers.find((column) => numberIn(column.name) === number);
      if (!filled(key) && !filled(partner)) return [];
      return [{ key, item: read(cells, key, key.name) }];
    });
  }

  employee(id: string): Cells | undefined {
    return this.employeesById.get(id);
  }

  /** Every employee's row, one per ID, in file order. */
  employees(): Cells[] {
    return [...this.employeesById.values()];
  }

  /** The person's managers, nearest first; null when the person isn't in the employees file. */
  managerChain(id: string): readonly string[] | null {
    if (this.chains.has(id)) return this.chains.get(id) ?? null;
    const managerColumn = this.roleColumn("employees", "manager_id");
    let chain: string[] | null = null;
    if (this.employeesById.has(id)) {
      chain = [];
      const seen = new Set([id]);
      let current = this.employeesById.get(id);
      while (current && managerColumn) {
        const manager = (current[managerColumn.name] ?? "").trim();
        if (manager === "" || seen.has(manager)) break;
        chain.push(manager);
        seen.add(manager);
        current = this.employeesById.get(manager);
      }
    }
    this.chains.set(id, chain);
    return chain;
  }

  /**
   * The manager where the person's reporting line stops short: someone the employees file doesn't
   * have, so who is above them is unknown. Null when the line ends at the top or the person isn't
   * on file.
   */
  chainCutAt(id: string): string | null {
    const last = this.managerChain(id)?.at(-1);
    return last !== undefined && !this.employeesById.has(last) ? last : null;
  }

  /**
   * One person's transactions (by `column`) whose effective date falls in the `windowDays` days
   * ending on `day`, that day included; optionally only some types. Sorted by date, then file order.
   */
  historyWindow(
    column: ColumnSpec,
    person: string,
    day: number,
    windowDays: number,
    types: ReadonlySet<string> | null,
  ): HistoryEntry[] {
    const entries = this.historyIndex(column).get(person) ?? [];
    let low = 0;
    let high = entries.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((entries[middle]?.day ?? 0) <= day) low = middle + 1;
      else high = middle;
    }
    const found: HistoryEntry[] = [];
    for (let at = low - 1; at >= 0; at -= 1) {
      const entry = entries[at];
      if (!entry || entry.day <= day - windowDays) break;
      if (types === null || (entry.type !== null && types.has(entry.type))) found.push(entry);
    }
    return found.reverse();
  }

  /**
   * The person's transactions (by `column`) of this one's type, and of its amount when `amount` is
   * given, whose effective dates lie within `windowDays` of this one's on either side and that
   * were submitted before it: by the submitted time when the file has one (the earlier row first
   * on a tie), else by file order. What this row or a possible match can't supply is named instead.
   */
  duplicatesOf(
    column: ColumnSpec,
    index: number,
    windowDays: number,
    amount: ColumnSpec | null,
  ): { matches: HistoryEntry[]; missing: MissingField[] } {
    const dateColumn = this.roleColumn("transactions", "effective_date");
    const typeColumn = this.roleColumn("transactions", "type");
    const submittedColumn = this.roleColumn("transactions", "submitted_at");
    const cellsOf = (at: number) => this.rows[at]?.cells ?? {};
    if (!dateColumn || !typeColumn) return { matches: [], missing: [] };
    const person = read(cellsOf(index), column, column.name);
    const date = read(cellsOf(index), dateColumn, dateColumn.name);
    const type = read(cellsOf(index), typeColumn, typeColumn.name);
    const own = amount ? read(cellsOf(index), amount, amount.name) : null;
    const ownMissing = [person, date, type, own].flatMap((item) =>
      item?.kind === "missing" ? item.missing : [],
    );
    if (person.kind !== "value" || type.kind !== "value" || date.kind !== "value") {
      return { matches: [], missing: ownMissing };
    }
    if (ownMissing.length > 0 || !(date.value instanceof DateValue)) {
      return { matches: [], missing: ownMissing };
    }
    const day = date.value.day;
    const submittedAt = (at: number) =>
      submittedColumn ? read(cellsOf(at), submittedColumn, submittedColumn.name) : null;
    const mine = submittedAt(index);
    const matches: HistoryEntry[] = [];
    const missing = new Map<string, MissingField>();
    const note = (items: readonly MissingField[]) => {
      for (const item of items)
        missing.set(`${item.field}|${item.reason}|${item.value ?? ""}`, item);
    };
    for (const entry of this.historyIndex(column).get(person.raw) ?? []) {
      if (entry.index === index || Math.abs(entry.day - day) > windowDays) continue;
      if (entry.type === null) {
        note([{ field: typeColumn.name, reason: "blank" }]);
        continue;
      }
      if (entry.type !== type.raw) continue;
      if (amount && own?.kind === "value") {
        const theirs = read(cellsOf(entry.index), amount, amount.name);
        if (theirs.kind === "missing") {
          note(theirs.missing);
          continue;
        }
        if (theirs.value !== own.value) continue;
      }
      if (!submittedColumn) {
        if (entry.index < index) matches.push(entry);
        continue;
      }
      const theirs = submittedAt(entry.index);
      if (mine?.kind === "missing" || theirs?.kind === "missing") {
        note([
          ...(mine?.kind === "missing" ? mine.missing : []),
          ...(theirs?.kind === "missing" ? theirs.missing : []),
        ]);
        continue;
      }
      if (!(mine?.value instanceof DateValue) || !(theirs?.value instanceof DateValue)) continue;
      const compared = compareDates(theirs.value, mine.value);
      if (compared < 0 || (compared === 0 && entry.index < index)) matches.push(entry);
    }
    return { matches, missing: [...missing.values()] };
  }

  private historyIndex(column: ColumnSpec): ReadonlyMap<string, readonly HistoryEntry[]> {
    const known = this.histories.get(column.name);
    if (known) return known;
    const dateColumn = this.roleColumn("transactions", "effective_date");
    const typeColumn = this.roleColumn("transactions", "type");
    const index = new Map<string, HistoryEntry[]>();
    if (dateColumn) {
      for (const row of this.rows) {
        const person = (row.cells[column.name] ?? "").trim();
        const date = readCell(row.cells[dateColumn.name], dateColumn);
        // Rows without a person or a readable date can't be placed in anyone's history.
        if (person === "" || !date.ok || !(date.value instanceof DateValue)) continue;
        const type = (typeColumn && row.cells[typeColumn.name]?.trim()) || null;
        const list = index.get(person) ?? [];
        list.push({
          index: row.index,
          day: date.value.day,
          type,
          transactionId: row.transactionId,
        });
        index.set(person, list);
      }
    }
    for (const list of index.values()) list.sort((a, b) => a.day - b.day || a.index - b.index);
    this.histories.set(column.name, index);
    return index;
  }
}

export function prepareDataset(
  input: DatasetInput,
  options: { calendar?: WorkCalendar } = {},
): PreparedDataset {
  return new PreparedDataset(input, options);
}
