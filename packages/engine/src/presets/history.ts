import { PRESET_CATALOGUE } from "@hrcc/shared";
import type { HistoryEntry } from "../dataset.js";
import { DateValue } from "../values.js";
import {
  appliesToTypes,
  built,
  Columns,
  listParam,
  numberParam,
  rawOf,
  roleName,
  textParam,
} from "./common.js";
import type { Params, PresetDefinition, RowContext } from "./types.js";

function personRole(params: Params): "employee_id" | "requester_id" {
  return params.get("per") === "requester" ? "requester_id" : "employee_id";
}

/** The person's transactions of the rule's types in the window ending on this one's date. */
function windowEntries(row: RowContext): HistoryEntry[] {
  const column = row.dataset.roleColumn("transactions", personRole(row.params));
  const dateColumn = row.dataset.roleColumn("transactions", "effective_date");
  if (!column || !dateColumn) return [];
  const person = (row.dataset.rows[row.rowIndex]?.cells[column.name] ?? "").trim();
  const date = row.dataset.field(row.rowIndex, dateColumn.name);
  if (person === "" || date.kind !== "value" || !(date.value instanceof DateValue)) return [];
  return row.dataset.historyWindow(
    column,
    person,
    date.value.day,
    numberParam(row.params, "window_days"),
    new Set(listParam(row.params, "types")),
  );
}

/** "An employee may have at most 2 allowance changes in any 12-month period." */
export const maxCountInWindow: PresetDefinition = {
  id: "max_count_in_window",
  checkKind: "structured",
  parameters: PRESET_CATALOGUE.max_count_in_window.parameters,
  build(params, dataset) {
    const columns = new Columns(dataset);
    const person = columns.role("transactions", personRole(params));
    columns.role("transactions", "effective_date");
    return built(columns, appliesToTypes(params, columns), {
      ">": [
        { history_count: [{ var: person }, { param: "types" }, { param: "window_days" }] },
        { param: "max_count" },
      ],
    });
  },
  evidence(row) {
    const person = roleName(row, personRole(row.params)) ?? personRole(row.params);
    const entries = windowEntries(row);
    return [
      { field: person, value: rawOf(row, person), condition: "" },
      {
        field: "count_in_window",
        value: String(entries.length),
        condition: `> ${numberParam(row.params, "max_count")}`,
      },
      {
        field: "transactions_in_window",
        value: entries.map((entry) => entry.transactionId ?? `row ${entry.index + 1}`),
        condition: `within ${numberParam(row.params, "window_days")} days`,
      },
    ];
  },
  nearMiss(row) {
    const count = windowEntries(row).length;
    const max = numberParam(row.params, "max_count");
    if (count !== max) return null;
    return {
      reason: "count_at_limit",
      facts: [{ field: "count_in_window", value: String(count), condition: `== ${max}` }],
    };
  },
};

/** The earlier transactions this one repeats, by the rule's values. */
function repeated(row: RowContext): HistoryEntry[] {
  const person = row.dataset.roleColumn("transactions", "employee_id");
  const amountName =
    textParam(row.params, "same_amount") === "yes" ? roleName(row, "amount") : undefined;
  const amount = amountName ? (row.dataset.column("transactions", amountName) ?? null) : null;
  if (!person) return [];
  const windowDays = numberParam(row.params, "window_days");
  return row.dataset.duplicatesOf(person, row.rowIndex, windowDays, amount).matches;
}

/** "Two pay changes for the same employee and amount within 7 days are duplicates." */
export const duplicateTransaction: PresetDefinition = {
  id: "duplicate_transaction",
  checkKind: "structured",
  parameters: PRESET_CATALOGUE.duplicate_transaction.parameters,
  build(params, dataset) {
    const columns = new Columns(dataset);
    const person = columns.role("transactions", "employee_id");
    columns.role("transactions", "effective_date");
    columns.role("transactions", "type");
    const amount =
      textParam(params, "same_amount") === "yes"
        ? [{ var: columns.role("transactions", "amount") }]
        : [];
    return built(columns, appliesToTypes(params, columns), {
      ">": [{ history_duplicates: [{ var: person }, { param: "window_days" }, ...amount] }, 0],
    });
  },
  evidence(row) {
    const person = roleName(row, "employee_id") ?? "employee_id";
    const type = roleName(row, "type") ?? "type";
    const amount =
      textParam(row.params, "same_amount") === "yes" ? roleName(row, "amount") : undefined;
    return [
      { field: person, value: rawOf(row, person), condition: "" },
      { field: type, value: rawOf(row, type), condition: "" },
      ...(amount ? [{ field: amount, value: rawOf(row, amount), condition: "same amount" }] : []),
      {
        field: "duplicate_of",
        value: repeated(row).map((entry) => entry.transactionId ?? `row ${entry.index + 1}`),
        condition: `within ${numberParam(row.params, "window_days")} days, submitted earlier`,
      },
    ];
  },
};
