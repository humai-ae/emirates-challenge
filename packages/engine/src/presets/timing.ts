import { DateValue } from "../values.js";
import {
  appliesToTypes,
  built,
  Columns,
  numberParam,
  rawOf,
  roleName,
  TYPES_PARAMETER,
} from "./common.js";
import type { PresetDefinition, RowContext } from "./types.js";

/** Calendar days from the effective date to another date of the row; null when either is missing. */
function daysAfterEffective(row: RowContext, column: string): number | null {
  const effectiveColumn = roleName(row, "effective_date");
  if (!effectiveColumn) return null;
  const effective = row.dataset.field(row.rowIndex, effectiveColumn);
  const other = row.dataset.field(row.rowIndex, column);
  if (effective.kind !== "value" || other.kind !== "value") return null;
  if (!(effective.value instanceof DateValue) || !(other.value instanceof DateValue)) return null;
  return other.value.day - effective.value.day;
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
    parameters: [TYPES_PARAMETER, { name: limit, type: "integer", min: 0 }],
    build(params, dataset) {
      const columns = new Columns(dataset);
      const effective = columns.role("transactions", "effective_date");
      const other = columns.role("transactions", role);
      return built(columns, appliesToTypes(params, columns), {
        ">": [{ days_between: [{ var: effective }, { var: other }] }, { param: limit }],
      });
    },
    evidence(row) {
      const effective = roleName(row, "effective_date") ?? "effective_date";
      const other = roleName(row, role) ?? role;
      const days = numberParam(row.params, limit);
      return [
        { field: other, value: rawOf(row, other), condition: `> ${effective} + ${days} days` },
        { field: effective, value: rawOf(row, effective), condition: "" },
        {
          field: "days_after_effective",
          value: String(daysAfterEffective(row, other) ?? ""),
          condition: `> ${days}`,
        },
      ];
    },
    nearMiss(row) {
      const other = roleName(row, role);
      if (!other) return null;
      const days = daysAfterEffective(row, other);
      const allowed = numberParam(row.params, limit);
      if (days !== allowed) return null;
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
