import type { DatasetFileKind, Evidence, Expression } from "@hrcc/shared";
import type { PreparedDataset } from "../dataset.js";
import { splitList } from "../values.js";
import type { BuildResult, NeededField, Params, RowContext } from "./types.js";

/** Finds columns by role while a preset builds its check, noting the roles the dataset lacks. */
export class Columns {
  readonly needs: NeededField[] = [];

  constructor(private readonly dataset: PreparedDataset) {}

  role(file: DatasetFileKind, role: string): string {
    const column = this.dataset.roleColumn(file, role);
    if (column) return column.name;
    this.needs.push({ file, role });
    return role;
  }
}

/** `appliesTo` for the types parameter: every transaction when it is unset. */
export function appliesToTypes(params: Params, columns: Columns): Expression {
  const types = params.get("types");
  if (types === null || types === undefined) return true;
  return { in: [{ var: columns.role("transactions", "type") }, { param: "types" }] };
}

/** The built expressions, or the roles the dataset lacks. */
export function built(columns: Columns, appliesTo: Expression, logic: Expression): BuildResult {
  return columns.needs.length > 0
    ? { ok: false, needs: columns.needs }
    : { ok: true, appliesTo, logic };
}

export function numberParam(params: Params, name: string): number {
  const value = params.get(name);
  if (typeof value !== "number") throw new Error(`Parameter ${name} must be a number`);
  return value;
}

export function optionalNumber(params: Params, name: string): number | null {
  const value = params.get(name);
  return typeof value === "number" ? value : null;
}

export function textParam(params: Params, name: string): string {
  const value = params.get(name);
  if (typeof value !== "string") throw new Error(`Parameter ${name} must be text`);
  return value;
}

export function listParam(params: Params, name: string): readonly string[] {
  const value = params.get(name);
  if (!Array.isArray(value)) throw new Error(`Parameter ${name} must be a list`);
  return value;
}

/** A list parameter's items; none when it is unset. */
export function optionalList(params: Params, name: string): readonly string[] {
  const value = params.get(name);
  return Array.isArray(value) ? value : [];
}

/** The name of the transactions column playing a role. */
export function roleName(row: RowContext, role: string): string | undefined {
  return row.dataset.roleColumn("transactions", role)?.name;
}

/** A field's text as written in the file; blank when the field is missing. */
export function rawOf(row: RowContext, field: string): string {
  const resolved = row.dataset.field(row.rowIndex, field);
  return resolved.kind === "value" ? resolved.raw : "";
}

/** The text of each known item of a field: approvers' grades, or a list cell's items. */
export function rawList(row: RowContext, field: string): string[] {
  const resolved = row.dataset.field(row.rowIndex, field);
  if (resolved.kind === "list") {
    return resolved.items.flatMap((item) => (item.kind === "value" ? [item.raw] : []));
  }
  return resolved.kind === "value" ? splitList(resolved.raw) : [];
}

/** A field's number; null when it is blank, unreadable or not a number. */
export function numberOf(row: RowContext, field: string): number | null {
  const resolved = row.dataset.field(row.rowIndex, field);
  return resolved.kind === "value" && typeof resolved.value === "number" ? resolved.value : null;
}

/** Every item's number; null when an item is missing or not a number. */
export function knownNumbers(row: RowContext, field: string): number[] | null {
  const resolved = row.dataset.field(row.rowIndex, field);
  if (resolved.kind !== "list") return null;
  const numbers: number[] = [];
  for (const item of resolved.items) {
    if (item.kind !== "value" || typeof item.value !== "number") return null;
    numbers.push(item.value);
  }
  return numbers;
}

/** The amount fact, for presets with an optional `amount_over`. */
export function amountOver(row: RowContext): Evidence[] {
  const threshold = optionalNumber(row.params, "amount_over");
  const column = roleName(row, "amount");
  if (threshold === null || !column) return [];
  return [{ field: column, value: rawOf(row, column), condition: `> ${threshold}` }];
}
