import { type Expression, PRESET_CATALOGUE } from "@hrcc/shared";
import { APPROVAL_TIMES } from "../dataset.js";
import { compareDates, DateValue } from "../values.js";
import { appliesToTypes, built, Columns, numberParam, rawOf, roleName } from "./common.js";
import type { PresetDefinition, RowContext } from "./types.js";

/** A date of the transaction as written, with the column it came from. */
interface Dated {
  field: string;
  raw: string;
  value: DateValue | null;
}

/** Several approval-time columns: one time per approver. */
function perApprover(row: Pick<RowContext, "dataset">): boolean {
  return row.dataset.roleColumns("transactions", "approved_at").length > 1;
}

/** The date a deadline is about: the role's column, or the latest of the approvers' times. */
function dateOf(row: RowContext, role: "approved_at" | "submitted_at"): Dated {
  if (role === "approved_at" && perApprover(row)) {
    let latest: Dated = { field: APPROVAL_TIMES, raw: "", value: null };
    for (const { key, item } of row.dataset.approvalTimes(row.rowIndex)) {
      if (item.kind !== "value" || !(item.value instanceof DateValue)) continue;
      if (latest.value === null || compareDates(item.value, latest.value) > 0) {
        latest = { field: key.name, raw: item.raw, value: item.value };
      }
    }
    return latest;
  }
  const column = roleName(row, role);
  if (!column) return { field: role, raw: "", value: null };
  const resolved = row.dataset.field(row.rowIndex, column);
  return {
    field: column,
    raw: resolved.kind === "value" ? resolved.raw : "",
    value: resolved.kind === "value" && resolved.value instanceof DateValue ? resolved.value : null,
  };
}

/** Calendar days from the effective date to the date; null when either is missing. */
function daysAfterEffective(row: RowContext, date: Dated): number | null {
  const effectiveColumn = roleName(row, "effective_date");
  if (!effectiveColumn || date.value === null) return null;
  const effective = row.dataset.field(row.rowIndex, effectiveColumn);
  if (effective.kind !== "value" || !(effective.value instanceof DateValue)) return null;
  return date.value.day - effective.value.day;
}

/** A date of the transaction must come no later than the effective date plus some days. */
function deadline(
  id: "approved_by_effective" | "submitted_within_after_effective",
  role: "approved_at" | "submitted_at",
  limit: "grace_days" | "max_days",
  nearReason: string,
): PresetDefinition {
  return {
    id,
    checkKind: "structured",
    parameters: PRESET_CATALOGUE[id].parameters,
    build(params, dataset) {
      const columns = new Columns(dataset);
      const effective = columns.role("transactions", "effective_date");
      const other = columns.role("transactions", role);
      // With a time per approver, the transaction counts as approved when its last approver did.
      const date: Expression =
        role === "approved_at" && perApprover({ dataset })
          ? { max: { var: APPROVAL_TIMES } }
          : { var: other };
      return built(columns, appliesToTypes(params, columns), {
        ">": [{ days_between: [{ var: effective }, date] }, { param: limit }],
      });
    },
    evidence(row) {
      const effective = roleName(row, "effective_date") ?? "effective_date";
      const date = dateOf(row, role);
      const days = numberParam(row.params, limit);
      return [
        { field: date.field, value: date.raw, condition: `> ${effective} + ${days} days` },
        { field: effective, value: rawOf(row, effective), condition: "" },
        {
          field: "days_after_effective",
          value: String(daysAfterEffective(row, date) ?? ""),
          condition: `> ${days}`,
        },
      ];
    },
    nearMiss(row) {
      const days = daysAfterEffective(row, dateOf(row, role));
      const allowed = numberParam(row.params, limit);
      if (days === null || days !== allowed) return null;
      return {
        reason: nearReason,
        facts: [{ field: "days_after_effective", value: String(days), condition: `== ${allowed}` }],
      };
    },
  };
}

/** "Pay changes must be approved on or before their effective date", with optional grace days. */
export const approvedByEffective = deadline(
  "approved_by_effective",
  "approved_at",
  "grace_days",
  "approved_on_deadline",
);

/** "Transactions must be submitted no later than 30 days after their effective date." */
export const submittedWithinAfterEffective = deadline(
  "submitted_within_after_effective",
  "submitted_at",
  "max_days",
  "submitted_on_deadline",
);

/** The request time, then each approval time, as written; unreadable ones are left out. */
function timeline(row: RowContext): Dated[] {
  const submitted = dateOf(row, "submitted_at");
  const approvals = row.dataset
    .approvalTimes(row.rowIndex)
    .flatMap(({ key, item }) =>
      item.kind === "value" && item.value instanceof DateValue
        ? [{ field: key.name, raw: item.raw, value: item.value }]
        : [],
    );
  return [...(submitted.value ? [submitted] : []), ...approvals];
}

/** "Approvals must come after the request, each on or after the one listed above it." */
export const approvalsInOrder: PresetDefinition = {
  id: "approvals_in_order",
  checkKind: "structured",
  parameters: PRESET_CATALOGUE.approvals_in_order.parameters,
  build(params, dataset) {
    const columns = new Columns(dataset);
    const submitted = columns.role("transactions", "submitted_at");
    columns.role("transactions", "approved_at");
    return built(columns, appliesToTypes(params, columns), {
      "!": { in_order: [{ var: submitted }, { var: APPROVAL_TIMES }] },
    });
  },
  evidence(row) {
    let latest: Dated | null = null;
    for (const item of timeline(row)) {
      if (latest?.value && item.value && compareDates(item.value, latest.value) < 0) {
        return [
          { field: item.field, value: item.raw, condition: `< ${latest.field}` },
          { field: latest.field, value: latest.raw, condition: "" },
        ];
      }
      if (!latest?.value || (item.value && compareDates(item.value, latest.value) > 0)) {
        latest = item;
      }
    }
    return [];
  },
};

/** The employee's hire date as a field of the transaction: "employee.hire_date". */
function hireField(row: Pick<RowContext, "dataset">): string {
  return `employee.${row.dataset.roleColumn("employees", "hire_date")?.name ?? "hire_date"}`;
}

/** Calendar days from the employee's hire date to the effective date; null when either is missing. */
function daysSinceHire(row: RowContext): number | null {
  const effectiveColumn = roleName(row, "effective_date");
  if (!effectiveColumn || !row.dataset.roleColumn("employees", "hire_date")) return null;
  const hired = row.dataset.field(row.rowIndex, hireField(row));
  const effective = row.dataset.field(row.rowIndex, effectiveColumn);
  if (hired.kind !== "value" || effective.kind !== "value") return null;
  if (!(hired.value instanceof DateValue) || !(effective.value instanceof DateValue)) return null;
  return effective.value.day - hired.value.day;
}

/** "Pay changes must not take effect in the employee's first 180 days." */
export const tenureMinimum: PresetDefinition = {
  id: "tenure_minimum",
  checkKind: "structured",
  parameters: PRESET_CATALOGUE.tenure_minimum.parameters,
  build(params, dataset) {
    const columns = new Columns(dataset);
    columns.role("transactions", "employee_id");
    const effective = columns.role("transactions", "effective_date");
    const hired = columns.role("employees", "hire_date");
    return built(columns, appliesToTypes(params, columns), {
      "<": [
        { days_between: [{ var: `employee.${hired}` }, { var: effective }] },
        { param: "min_days" },
      ],
    });
  },
  evidence(row) {
    const effective = roleName(row, "effective_date") ?? "effective_date";
    return [
      { field: hireField(row), value: rawOf(row, hireField(row)), condition: "" },
      { field: effective, value: rawOf(row, effective), condition: "" },
      {
        field: "days_since_hire",
        value: String(daysSinceHire(row) ?? ""),
        condition: `< ${numberParam(row.params, "min_days")}`,
      },
    ];
  },
  nearMiss(row) {
    const days = daysSinceHire(row);
    const minimum = numberParam(row.params, "min_days");
    if (days !== minimum) return null;
    return {
      reason: "days_at_minimum",
      facts: [{ field: "days_since_hire", value: String(days), condition: `== ${minimum}` }],
    };
  },
};
