import {
  CHECK_OPERATORS,
  type Check,
  type CheckOperator,
  CheckSchema,
  type Expression,
} from "@hrcc/shared";
import type { PreparedDataset } from "./dataset.js";

export type CheckIssueCode =
  | "invalid_shape"
  | "unknown_operator"
  | "bad_arguments"
  | "unknown_field"
  | "missing_role"
  | "unknown_parameter"
  | "duplicate_parameter"
  | "element_outside_list"
  | "too_complex"
  | "fields_used_mismatch";

export interface CheckIssue {
  code: CheckIssueCode;
  /** Where in the check, such as `logic.and[1].none[0]`. */
  at: string;
  detail: string;
}

export type CheckValidation =
  | { ok: true; check: Check; fieldsUsed: string[] }
  | { ok: false; issues: CheckIssue[] };

const OPERATORS: ReadonlySet<string> = new Set(CHECK_OPERATORS);
const MAX_DEPTH = 24;
const MAX_NODES = 400;

/** How many arguments each operator takes, at least and at most. */
const ARITY: Record<CheckOperator, readonly [number, number]> = {
  and: [1, 20],
  or: [1, 20],
  "!": [1, 1],
  if: [3, 21],
  "==": [2, 2],
  "!=": [2, 2],
  ">": [2, 2],
  ">=": [2, 2],
  "<": [2, 2],
  "<=": [2, 2],
  in: [2, 2],
  between: [3, 3],
  var: [1, 1],
  param: [1, 1],
  some: [2, 2],
  all: [2, 2],
  none: [2, 2],
  count: [1, 2],
  max: [1, 1],
  min: [1, 1],
  missing_from: [2, 2],
  days_between: [2, 2],
  working_days_between: [2, 2],
  hour_of: [1, 1],
  weekday_of: [1, 1],
  in_order: [1, 3],
  is_blank: [1, 1],
  same_person: [2, 2],
  in_manager_chain: [2, 3],
  history_count: [3, 3],
  history_sum: [4, 4],
};
/** Their second argument is tested once per list element. */
const QUANTIFIERS: ReadonlySet<string> = new Set(["some", "all", "none", "count"]);

interface WalkState {
  nodes: number;
  issues: CheckIssue[];
  fields: Set<string>;
  parameters: ReadonlySet<string>;
  dataset: PreparedDataset;
}

/** The field name of a `{"var": "<name>"}` node; null for anything else, and for `""`. */
export function varName(node: Expression | undefined): string | null {
  if (node === null || node === undefined || typeof node !== "object" || Array.isArray(node)) {
    return null;
  }
  const keys = Object.keys(node);
  if (keys.length !== 1 || keys[0] !== "var") return null;
  const raw = node.var;
  const name = Array.isArray(raw) ? raw[0] : raw;
  return typeof name === "string" && name !== "" ? name : null;
}

function checkField(name: Expression | undefined, at: string, lists: number, state: WalkState) {
  if (typeof name !== "string") {
    state.issues.push({ code: "bad_arguments", at, detail: "var takes a field name" });
    return;
  }
  if (name === "") {
    if (lists === 0) {
      state.issues.push({
        code: "element_outside_list",
        at,
        detail: "the current element exists only inside some, all, none or count",
      });
    }
    return;
  }
  const result = state.dataset.parsePath(name);
  if (!result.ok) {
    state.issues.push({ code: result.problem, at, detail: result.detail });
    return;
  }
  state.fields.add(name);
}

function checkHistory(
  operator: "history_count" | "history_sum",
  args: readonly Expression[],
  at: string,
  depth: number,
  lists: number,
  state: WalkState,
) {
  // The person (and the amount) must be plain transactions columns: the engine indexes them
  // across all rows.
  const columnArguments = operator === "history_sum" ? [0, 3] : [0];
  args.forEach((arg, index) => {
    if (!columnArguments.includes(index)) {
      walk(arg, `${at}[${index}]`, depth + 1, lists, state);
      return;
    }
    const name = varName(arg);
    const result = name ? state.dataset.parsePath(name) : null;
    if (!name || !result?.ok || result.path.kind !== "column") {
      state.issues.push({
        code: "bad_arguments",
        at: `${at}[${index}]`,
        detail: 'needs a transactions column, written {"var": "<column>"}',
      });
      return;
    }
    state.fields.add(name);
  });
  for (const role of ["effective_date", "type"]) {
    const column = state.dataset.roleColumn("transactions", role);
    if (column) state.fields.add(column.name);
    else state.issues.push({ code: "missing_role", at, detail: `transactions: ${role}` });
  }
}

function walk(node: Expression, at: string, depth: number, lists: number, state: WalkState) {
  state.nodes += 1;
  if (depth > MAX_DEPTH || state.nodes > MAX_NODES) {
    if (!state.issues.some((issue) => issue.code === "too_complex")) {
      state.issues.push({
        code: "too_complex",
        at,
        detail: `at most ${MAX_DEPTH} levels and ${MAX_NODES} parts`,
      });
    }
    return;
  }
  if (node === null) {
    state.issues.push({ code: "bad_arguments", at, detail: "null is not a value" });
    return;
  }
  if (typeof node !== "object") return;
  if (Array.isArray(node)) {
    // A list of plain values, such as ["allowance_change", "pay_change"].
    node.forEach((item, index) => {
      if (item === null || typeof item === "object") {
        state.issues.push({
          code: "bad_arguments",
          at: `${at}[${index}]`,
          detail: "lists hold plain values only",
        });
      }
    });
    return;
  }
  const keys = Object.keys(node);
  const [operator = ""] = keys;
  if (keys.length !== 1) {
    state.issues.push({ code: "bad_arguments", at, detail: "each part has exactly one operator" });
    return;
  }
  if (!OPERATORS.has(operator)) {
    state.issues.push({ code: "unknown_operator", at, detail: operator });
    return;
  }
  const known = operator as CheckOperator;
  const raw = node[operator];
  const args: readonly Expression[] = Array.isArray(raw) ? raw : [raw];
  const here = `${at}.${operator}`;
  const [min, max] = ARITY[known];
  if (args.length < min || args.length > max || (known === "if" && args.length % 2 === 0)) {
    const count = min === max ? `${min}` : `${min} to ${max}`;
    state.issues.push({
      code: "bad_arguments",
      at: here,
      detail: `${operator} takes ${count} arguments`,
    });
    return;
  }
  switch (known) {
    case "var":
      checkField(args[0], here, lists, state);
      return;
    case "param": {
      const name = args[0];
      if (typeof name !== "string" || !state.parameters.has(name)) {
        state.issues.push({ code: "unknown_parameter", at: here, detail: String(name) });
      }
      return;
    }
    case "history_count":
    case "history_sum":
      checkHistory(known, args, here, depth, lists, state);
      return;
    default:
      args.forEach((arg, index) => {
        const inner = QUANTIFIERS.has(known) && index === 1 ? lists + 1 : lists;
        walk(arg, `${here}[${index}]`, depth + 1, inner, state);
      });
  }
}

/** The fields two expressions use (sorted) and their problems, for a dataset's columns. */
export function inspectExpressions(
  appliesTo: Expression,
  logic: Expression,
  parameters: ReadonlySet<string>,
  dataset: PreparedDataset,
): { fields: string[]; issues: CheckIssue[] } {
  const state: WalkState = { nodes: 0, issues: [], fields: new Set(), parameters, dataset };
  walk(appliesTo, "appliesTo", 0, 0, state);
  walk(logic, "logic", 0, 0, state);
  return { fields: [...state.fields].sort(), issues: state.issues };
}

/** A check's shape, operators, fields and parameters, checked against a dataset's columns. */
export function validateCheck(input: unknown, dataset: PreparedDataset): CheckValidation {
  const parsed = CheckSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(
        (issue): CheckIssue => ({
          code: "invalid_shape",
          at: issue.path.map(String).join("."),
          detail: issue.message,
        }),
      ),
    };
  }
  const check = parsed.data;
  const issues: CheckIssue[] = [];
  const names = new Set<string>();
  for (const parameter of check.parameters) {
    if (names.has(parameter.name)) {
      issues.push({ code: "duplicate_parameter", at: "parameters", detail: parameter.name });
    }
    names.add(parameter.name);
  }
  const inspected = inspectExpressions(check.appliesTo, check.logic, names, dataset);
  issues.push(...inspected.issues);
  const declared = [...new Set(check.fieldsUsed)].sort();
  if (declared.join("\n") !== inspected.fields.join("\n")) {
    issues.push({
      code: "fields_used_mismatch",
      at: "fieldsUsed",
      detail: inspected.fields.join(", "),
    });
  }
  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, check, fieldsUsed: inspected.fields };
}
