import type { Expression, MissingField, ParameterValue } from "@hrcc/shared";
import type { ColumnSpec, HistoryEntry, PreparedDataset, Resolved } from "./dataset.js";
import { varName } from "./validate.js";
import { DateValue, splitList, weekdayOf, workingDaysBetween } from "./values.js";

/** Missing data: a test on it can't be decided either way. */
export class Unknown {
  constructor(readonly missing: readonly MissingField[]) {}
}

/** A mistake in the check itself, such as comparing a date with a number. */
export class EvaluationError extends Error {}

export type Scalar = string | number | boolean | DateValue;
export type Value = Scalar | readonly Entry[];
/** A list element, which may itself be missing (an approver who is not on file). */
export type Entry = Value | Unknown;
export type Result = Value | Unknown;

export interface Scope {
  dataset: PreparedDataset;
  rowIndex: number;
  params: ReadonlyMap<string, ParameterValue>;
  /** The element some, all, none or count is looking at. */
  element?: Entry;
}

type Handler = (args: readonly Expression[], scope: Scope) => Result;

const isUnknown = (value: Entry): value is Unknown => value instanceof Unknown;
const isList = (value: Entry): value is readonly Entry[] => Array.isArray(value);

function merge(unknowns: readonly Unknown[]): Unknown {
  const fields = new Map<string, MissingField>();
  for (const unknown of unknowns) {
    for (const item of unknown.missing) {
      fields.set(`${item.field}|${item.reason}|${item.value ?? ""}`, item);
    }
  }
  return new Unknown([...fields.values()]);
}

function arg(args: readonly Expression[], index: number): Expression {
  const value = args[index];
  if (value === undefined) throw new EvaluationError("an argument is missing");
  return value;
}

function describe(value: Value): string {
  if (isList(value)) return "a list";
  if (value instanceof DateValue) return "a date";
  return typeof value === "string" ? "text" : `a ${typeof value}`;
}

function truth(value: Result, operator: string): boolean | Unknown {
  if (value instanceof Unknown || typeof value === "boolean") return value;
  throw new EvaluationError(`${operator} needs true or false, not ${describe(value)}`);
}

function items(value: Result, operator: string): readonly Entry[] | Unknown {
  if (value instanceof Unknown || isList(value)) return value;
  throw new EvaluationError(`${operator} needs a list, not ${describe(value)}`);
}

function scalar(value: Value, operator: string): Scalar {
  if (isList(value)) {
    throw new EvaluationError(
      `${operator} compares single values; use some, all or none for a list`,
    );
  }
  return value;
}

/** -1, 0 or 1. Dates compare by day; two times on the same day compare by the minute. */
function order(left: Scalar, right: Scalar, operator: string): number {
  if (typeof left === "number" && typeof right === "number") return Math.sign(left - right);
  if (typeof left === "string" && typeof right === "string") {
    return left === right ? 0 : left < right ? -1 : 1;
  }
  if (typeof left === "boolean" && typeof right === "boolean") return Number(left) - Number(right);
  if (left instanceof DateValue && right instanceof DateValue) {
    if (left.day !== right.day || left.minute === null || right.minute === null) {
      return Math.sign(left.day - right.day);
    }
    return Math.sign(left.minute - right.minute);
  }
  throw new EvaluationError(`${operator} cannot compare ${describe(left)} with ${describe(right)}`);
}

function same(left: Scalar, right: Scalar): boolean {
  if (left instanceof DateValue && right instanceof DateValue) {
    return left.day === right.day && left.minute === right.minute;
  }
  return left === right;
}

function dateOf(value: Value, operator: string): DateValue {
  if (value instanceof DateValue) return value;
  throw new EvaluationError(`${operator} needs a date, not ${describe(value)}`);
}

function personId(value: Value, operator: string): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  throw new EvaluationError(`${operator} needs an employee ID, not ${describe(value)}`);
}

function textItems(value: Value, operator: string): string[] {
  if (typeof value === "string") return splitList(value);
  if (isList(value)) {
    return value.map((item) => {
      if (typeof item !== "string") throw new EvaluationError(`${operator} needs text items`);
      return item;
    });
  }
  throw new EvaluationError(`${operator} needs a list of text, not ${describe(value)}`);
}

function fromResolved(resolved: Resolved): Result {
  if (resolved.kind === "missing") return new Unknown(resolved.missing);
  if (resolved.kind === "value") return resolved.value;
  return resolved.items.map((item) =>
    item.kind === "value" ? item.value : new Unknown(item.missing),
  );
}

function connective(operator: "and" | "or"): Handler {
  // and: one false decides; or: one true decides. Otherwise any unknown part leaves it unknown.
  const decisive = operator === "or";
  return (args, scope) => {
    const unknowns: Unknown[] = [];
    for (const part of args) {
      const value = truth(evaluate(part, scope), operator);
      if (value === decisive) return decisive;
      if (value instanceof Unknown) unknowns.push(value);
    }
    return unknowns.length > 0 ? merge(unknowns) : !decisive;
  };
}

function comparison(operator: string, test: (order: number) => boolean): [string, Handler] {
  return [
    operator,
    (args, scope) => {
      const left = evaluate(arg(args, 0), scope);
      const right = evaluate(arg(args, 1), scope);
      if (left instanceof Unknown || right instanceof Unknown) {
        return merge([left, right].filter(isUnknown));
      }
      return test(order(scalar(left, operator), scalar(right, operator), operator));
    },
  ];
}

function quantifier(operator: "some" | "all" | "none"): Handler {
  return (args, scope) => {
    const list = items(evaluate(arg(args, 0), scope), operator);
    if (list instanceof Unknown) return list;
    const body = arg(args, 1);
    const unknowns: Unknown[] = [];
    let anyTrue = false;
    let anyFalse = false;
    for (const element of list) {
      const value = truth(evaluate(body, { ...scope, element }), operator);
      if (value instanceof Unknown) unknowns.push(value);
      else if (value) anyTrue = true;
      else anyFalse = true;
    }
    if (operator === "some" && anyTrue) return true;
    if (operator === "all" && anyFalse) return false;
    if (operator === "none" && anyTrue) return false;
    if (unknowns.length > 0) return merge(unknowns);
    return operator !== "some";
  };
}

function extreme(operator: "max" | "min"): Handler {
  return (args, scope) => {
    const list = items(evaluate(arg(args, 0), scope), operator);
    if (list instanceof Unknown) return list;
    const unknowns = list.filter(isUnknown);
    if (unknowns.length > 0) return merge(unknowns);
    const values = list
      .filter((item): item is Value => !(item instanceof Unknown))
      .map((item) => scalar(item, operator));
    const [first, ...rest] = values;
    if (first === undefined) throw new EvaluationError(`${operator} of an empty list`);
    let best = first;
    for (const value of rest) {
      const compared = order(value, best, operator);
      if (operator === "max" ? compared > 0 : compared < 0) best = value;
    }
    return best;
  };
}

function datePair(
  operator: string,
  combine: (from: DateValue, to: DateValue, scope: Scope) => number,
): [string, Handler] {
  return [
    operator,
    (args, scope) => {
      const from = evaluate(arg(args, 0), scope);
      const to = evaluate(arg(args, 1), scope);
      if (from instanceof Unknown || to instanceof Unknown) {
        return merge([from, to].filter(isUnknown));
      }
      return combine(dateOf(from, operator), dateOf(to, operator), scope);
    },
  ];
}

/** The transactions column a `{"var": "<column>"}` node names; null for anything else. */
function plainColumn(node: Expression, scope: Scope): ColumnSpec | null {
  const name = varName(node);
  const parsed = name ? scope.dataset.parsePath(name) : null;
  const path = parsed?.ok ? parsed.path : null;
  return path?.kind === "column" ? path.column : null;
}

/** The transactions of this row's person in the window ending on its effective date. */
function historyEntries(
  args: readonly Expression[],
  scope: Scope,
  operator: string,
): HistoryEntry[] | Unknown {
  const column = plainColumn(arg(args, 0), scope);
  if (!column) throw new EvaluationError(`${operator} needs a transactions column`);
  const dateColumn = scope.dataset.roleColumn("transactions", "effective_date");
  if (!dateColumn) throw new EvaluationError(`${operator} needs the effective date column`);
  const person = evaluate(arg(args, 0), scope);
  const date = fromResolved(
    scope.dataset.resolve(scope.rowIndex, { kind: "column", column: dateColumn }),
  );
  const types = evaluate(arg(args, 1), scope);
  const windowDays = evaluate(arg(args, 2), scope);
  if (
    person instanceof Unknown ||
    date instanceof Unknown ||
    types instanceof Unknown ||
    windowDays instanceof Unknown
  ) {
    return merge([person, date, types, windowDays].filter(isUnknown));
  }
  if (typeof windowDays !== "number" || !Number.isInteger(windowDays) || windowDays < 1) {
    throw new EvaluationError(`${operator} needs a whole number of days`);
  }
  return scope.dataset.historyWindow(
    column,
    personId(person, operator),
    dateOf(date, operator).day,
    windowDays,
    new Set(textItems(types, operator)),
  );
}

const HANDLERS = new Map<string, Handler>([
  ["and", connective("and")],
  ["or", connective("or")],
  [
    "!",
    (args, scope) => {
      const value = truth(evaluate(arg(args, 0), scope), "!");
      return value instanceof Unknown ? value : !value;
    },
  ],
  [
    "if",
    (args, scope) => {
      for (let index = 0; index + 1 < args.length; index += 2) {
        const condition = truth(evaluate(arg(args, index), scope), "if");
        if (condition instanceof Unknown) return condition;
        if (condition) return evaluate(arg(args, index + 1), scope);
      }
      return evaluate(arg(args, args.length - 1), scope);
    },
  ],
  comparison("==", (compared) => compared === 0),
  comparison("!=", (compared) => compared !== 0),
  comparison(">", (compared) => compared > 0),
  comparison(">=", (compared) => compared >= 0),
  comparison("<", (compared) => compared < 0),
  comparison("<=", (compared) => compared <= 0),
  [
    "in",
    (args, scope) => {
      const needle = evaluate(arg(args, 0), scope);
      const haystack = items(evaluate(arg(args, 1), scope), "in");
      if (needle instanceof Unknown || haystack instanceof Unknown) {
        return merge([needle, haystack].filter(isUnknown));
      }
      const item = scalar(needle, "in");
      const unknowns: Unknown[] = [];
      for (const entry of haystack) {
        if (entry instanceof Unknown) unknowns.push(entry);
        else if (!isList(entry) && same(item, entry)) return true;
      }
      return unknowns.length > 0 ? merge(unknowns) : false;
    },
  ],
  [
    "between",
    (args, scope) => {
      const value = evaluate(arg(args, 0), scope);
      const low = evaluate(arg(args, 1), scope);
      const high = evaluate(arg(args, 2), scope);
      if (value instanceof Unknown || low instanceof Unknown || high instanceof Unknown) {
        return merge([value, low, high].filter(isUnknown));
      }
      const item = scalar(value, "between");
      return (
        order(scalar(low, "between"), item, "between") <= 0 &&
        order(item, scalar(high, "between"), "between") <= 0
      );
    },
  ],
  [
    "var",
    (args, scope) => {
      const name = arg(args, 0);
      if (typeof name !== "string") throw new EvaluationError("var takes a field name");
      if (name === "") {
        if (scope.element === undefined) {
          throw new EvaluationError(
            "the current element exists only inside some, all, none or count",
          );
        }
        return scope.element;
      }
      const parsed = scope.dataset.parsePath(name);
      if (!parsed.ok) throw new EvaluationError(`unknown field ${name}`);
      return fromResolved(scope.dataset.resolve(scope.rowIndex, parsed.path));
    },
  ],
  [
    "param",
    (args, scope) => {
      const name = arg(args, 0);
      if (typeof name !== "string" || !scope.params.has(name)) {
        throw new EvaluationError(`unknown parameter ${String(name)}`);
      }
      const value = scope.params.get(name);
      if (value === null || value === undefined) {
        throw new EvaluationError(`parameter ${name} is not set`);
      }
      return value;
    },
  ],
  ["some", quantifier("some")],
  ["all", quantifier("all")],
  ["none", quantifier("none")],
  [
    "count",
    (args, scope) => {
      const list = items(evaluate(arg(args, 0), scope), "count");
      if (list instanceof Unknown) return list;
      if (args.length === 1) return list.length;
      const body = arg(args, 1);
      const unknowns: Unknown[] = [];
      let count = 0;
      for (const element of list) {
        const value = truth(evaluate(body, { ...scope, element }), "count");
        if (value instanceof Unknown) unknowns.push(value);
        else if (value) count += 1;
      }
      return unknowns.length > 0 ? merge(unknowns) : count;
    },
  ],
  ["max", extreme("max")],
  ["min", extreme("min")],
  [
    "missing_from",
    (args, scope) => {
      const actual = evaluate(arg(args, 0), scope);
      const required = evaluate(arg(args, 1), scope);
      if (required instanceof Unknown) return required;
      let present: ReadonlySet<string>;
      if (actual instanceof Unknown) {
        // A blank list means nothing is there; an unreadable one can't be checked.
        if (!actual.missing.every((item) => item.reason === "blank")) return actual;
        present = new Set();
      } else {
        present = new Set(textItems(actual, "missing_from"));
      }
      return textItems(required, "missing_from").filter((item) => !present.has(item));
    },
  ],
  datePair("days_between", (from, to) => to.day - from.day),
  datePair("working_days_between", (from, to, scope) =>
    workingDaysBetween(from.day, to.day, scope.dataset.calendar),
  ),
  [
    "hour_of",
    (args, scope) => {
      const value = evaluate(arg(args, 0), scope);
      if (value instanceof Unknown) return value;
      const date = dateOf(value, "hour_of");
      if (date.minute === null) throw new EvaluationError("hour_of needs a date with a time");
      return Math.floor(date.minute / 60);
    },
  ],
  [
    "weekday_of",
    (args, scope) => {
      const value = evaluate(arg(args, 0), scope);
      return value instanceof Unknown ? value : weekdayOf(dateOf(value, "weekday_of").day);
    },
  ],
  [
    "in_order",
    (args, scope) => {
      // Each argument is a time or a list of times; together, in order, they must never go back.
      const values: Entry[] = [];
      for (const part of args) {
        const value = evaluate(part, scope);
        if (isList(value)) values.push(...value);
        else values.push(value);
      }
      const unknowns: Unknown[] = [];
      let latest: Scalar | null = null;
      for (const value of values) {
        if (value instanceof Unknown) {
          unknowns.push(value);
          continue;
        }
        const item = scalar(value, "in_order");
        if (latest !== null) {
          const compared = order(item, latest, "in_order");
          if (compared < 0) return false;
          if (compared === 0) continue;
        }
        latest = item;
      }
      return unknowns.length > 0 ? merge(unknowns) : true;
    },
  ],
  [
    "is_blank",
    (args, scope) => {
      const value = evaluate(arg(args, 0), scope);
      if (value instanceof Unknown) {
        if (value.missing.every((item) => item.reason === "blank")) return true;
        // An ID that matched no employee hides whether the field is filled in.
        if (value.missing.some((item) => item.reason === "not_found")) return value;
        return false;
      }
      if (isList(value)) return value.length === 0;
      return typeof value === "string" && value.trim() === "";
    },
  ],
  [
    "same_person",
    (args, scope) => {
      const left = evaluate(arg(args, 0), scope);
      const right = evaluate(arg(args, 1), scope);
      if (left instanceof Unknown || right instanceof Unknown) {
        return merge([left, right].filter(isUnknown));
      }
      return personId(left, "same_person") === personId(right, "same_person");
    },
  ],
  [
    "in_manager_chain",
    (args, scope) => {
      const person = evaluate(arg(args, 0), scope);
      const other = evaluate(arg(args, 1), scope);
      const levels = args.length > 2 ? evaluate(arg(args, 2), scope) : null;
      if (person instanceof Unknown || other instanceof Unknown || levels instanceof Unknown) {
        return merge(
          [person, other, levels].filter((value): value is Unknown => value instanceof Unknown),
        );
      }
      if (
        levels !== null &&
        (typeof levels !== "number" || !Number.isInteger(levels) || levels < 1)
      ) {
        throw new EvaluationError("in_manager_chain needs a whole number of levels");
      }
      const id = personId(person, "in_manager_chain");
      const chain = scope.dataset.managerChain(id);
      if (chain === null) {
        const field = varName(arg(args, 0)) ?? "in_manager_chain";
        return new Unknown([{ field, reason: "not_found", value: id }]);
      }
      const manager = personId(other, "in_manager_chain");
      // Someone the employees file doesn't know can't be placed in anyone's reporting line.
      if (!scope.dataset.employee(manager)) {
        const field = varName(arg(args, 1)) ?? "in_manager_chain";
        return new Unknown([{ field, reason: "not_found", value: manager }]);
      }
      return (levels === null ? chain : chain.slice(0, levels)).includes(manager);
    },
  ],
  [
    "history_count",
    (args, scope) => {
      const entries = historyEntries(args, scope, "history_count");
      return entries instanceof Unknown ? entries : entries.length;
    },
  ],
  [
    "history_sum",
    (args, scope) => {
      const entries = historyEntries(args, scope, "history_sum");
      if (entries instanceof Unknown) return entries;
      const column = plainColumn(arg(args, 3), scope);
      if (!column) throw new EvaluationError("history_sum needs an amount column");
      const unknowns: Unknown[] = [];
      let total = 0;
      for (const entry of entries) {
        const amount = fromResolved(scope.dataset.resolve(entry.index, { kind: "column", column }));
        if (amount instanceof Unknown) unknowns.push(amount);
        else if (typeof amount === "number") total += amount;
        else throw new EvaluationError("history_sum needs numbers");
      }
      return unknowns.length > 0 ? merge(unknowns) : total;
    },
  ],
  [
    "history_duplicates",
    (args, scope) => {
      const column = plainColumn(arg(args, 0), scope);
      if (!column) throw new EvaluationError("history_duplicates needs a transactions column");
      const amount = args.length > 2 ? plainColumn(arg(args, 2), scope) : null;
      if (args.length > 2 && !amount) {
        throw new EvaluationError("history_duplicates needs an amount column");
      }
      const windowDays = evaluate(arg(args, 1), scope);
      if (windowDays instanceof Unknown) return windowDays;
      if (typeof windowDays !== "number" || !Number.isInteger(windowDays) || windowDays < 0) {
        throw new EvaluationError("history_duplicates needs a whole number of days");
      }
      const found = scope.dataset.duplicatesOf(column, scope.rowIndex, windowDays, amount);
      // One sure match decides; otherwise a match that can't be read leaves it unknown.
      if (found.matches.length === 0 && found.missing.length > 0) return new Unknown(found.missing);
      return found.matches.length;
    },
  ],
]);

/** An expression's value on one transaction. Missing data gives `Unknown`, never a guess. */
export function evaluate(node: Expression, scope: Scope): Result {
  if (node === null) throw new EvaluationError("null is not a value");
  if (typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((item) => evaluate(item, scope));
  const keys = Object.keys(node);
  const [operator = ""] = keys;
  // A Map, so names such as "constructor" never reach an object's prototype.
  const handler = keys.length === 1 ? HANDLERS.get(operator) : undefined;
  if (!handler) throw new EvaluationError(`not an allowed operator: ${keys.join(", ")}`);
  const raw = node[operator];
  return handler(Array.isArray(raw) ? raw : [raw], scope);
}
