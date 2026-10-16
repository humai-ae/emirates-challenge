import {
  type FlagKind,
  type FlagPerson,
  type FlagPersonRole,
  type FlagSettings,
  type ParameterValue,
  type PresetId,
  type ReportTo,
  type ReportToLevel,
  type ReportToMatrix,
  SENIORITY_BANDS,
  type SeniorityBand,
  type SeniorityBands,
  type Severity,
  type SeverityReason,
} from "@hrcc/shared";
import type { PreparedDataset } from "./dataset.js";
import { parseNumber } from "./profile.js";

const RISING: readonly Severity[] = ["Low", "Medium", "High"];
const DAY_MS = 86_400_000;
const DUBAI_OFFSET_MS = 4 * 3_600_000;

/** One level up; High stays High. */
export function raiseSeverity(severity: Severity): Severity {
  return RISING[Math.min(RISING.indexOf(severity) + 1, RISING.length - 1)] ?? severity;
}

/**
 * The amount a rule's check compares against, when it has one: the approval limit, the amount above
 * which a field or a justification is required, or a comparison on the amount column.
 */
export function ruleAmountLimit(
  preset: PresetId,
  values: Readonly<Record<string, ParameterValue>>,
  amountColumn: string | null,
): number | null {
  const number = (name: string): number | null => {
    const value = values[name];
    return typeof value === "number" ? value : null;
  };
  switch (preset) {
    case "approver_min_grade":
      return number("amount_limit");
    case "required_field":
    case "text_judgment":
      return number("amount_over");
    case "field_compare":
      return amountColumn !== null &&
        values.field === amountColumn &&
        (values.operator === ">" || values.operator === ">=")
        ? number("value")
        : null;
    default:
      return null;
  }
}

export interface SeverityInput {
  ruleSeverity: Severity;
  kind: FlagKind;
  /** How sure the AI was of a judgment; null for a rule's check. */
  confidence: Severity | null;
  amount: number | null;
  amountLimit: number | null;
  /** Another open flag on the same rule for the same employee or requester. */
  repeat: { flagId: string; person: "employee" | "requester"; personId: string } | null;
}

/**
 * The rule's severity, one level up for an amount over twice the rule's limit, one level up for a
 * repeat, and no higher than Medium for an unsure AI judgment. A step is a reason only when it
 * changes the level.
 */
export function flagSeverity(input: SeverityInput): {
  severity: Severity;
  reasons: SeverityReason[];
} {
  let severity = input.ruleSeverity;
  const reasons: SeverityReason[] = [{ code: "rule_default", severity }];
  const { amount, amountLimit } = input;
  if (
    amount !== null &&
    amountLimit !== null &&
    amountLimit > 0 &&
    amount > 2 * amountLimit &&
    severity !== "High"
  ) {
    severity = raiseSeverity(severity);
    reasons.push({ code: "amount_over_double_limit", amount, limit: amountLimit });
  }
  if (input.repeat && severity !== "High") {
    severity = raiseSeverity(severity);
    reasons.push({ code: "repeat_open_flag", ...input.repeat });
  }
  if (input.kind === "ai_judgment" && input.confidence === "Low" && severity === "High") {
    severity = "Medium";
    reasons.push({ code: "low_confidence_cap" });
  }
  return { severity, reasons };
}

/** The Dubai calendar day of a moment, as YYYY-MM-DD. */
export function dubaiDay(at: Date): string {
  return new Date(at.getTime() + DUBAI_OFFSET_MS).toISOString().slice(0, 10);
}

/** The day a flag raised on `day` (YYYY-MM-DD) is due, by its severity. */
export function dueDateFor(
  day: string,
  severity: Severity,
  dueDays: FlagSettings["dueDays"],
): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + dueDays[severity] * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Bands split at the grades' quartiles (nearest rank); null without any grade. */
export function proposeBands(grades: readonly number[]): SeniorityBands | null {
  const sorted = grades.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const at = (share: number): number =>
    sorted[Math.max(0, Math.ceil(share * sorted.length) - 1)] ?? 0;
  return { juniorMax: at(0.25), midMax: at(0.5), seniorMax: at(0.75) };
}

/** The bands of a dataset's employees, by the grade column. */
export function datasetBands(dataset: PreparedDataset): SeniorityBands | null {
  const column = dataset.roleColumn("employees", "grade");
  if (!column) return null;
  return proposeBands(
    dataset.employees().flatMap((row) => {
      const grade = parseNumber(row[column.name] ?? "");
      return grade === null ? [] : [grade];
    }),
  );
}

export function bandOf(grade: number, bands: SeniorityBands): SeniorityBand {
  if (grade <= bands.juniorMax) return "junior";
  if (grade <= bands.midMax) return "mid";
  if (grade <= bands.seniorMax) return "senior";
  return "executive";
}

/** The employee, requester and approvers of a transaction, as the employees file describes each. */
export function flagPeople(dataset: PreparedDataset, index: number): FlagPerson[] {
  const cells = dataset.rows[index]?.cells ?? {};
  const grade = dataset.roleColumn("employees", "grade")?.name;
  const department = dataset.roleColumn("employees", "department")?.name;
  const person = (role: FlagPersonRole, id: string): FlagPerson => {
    const row = dataset.employee(id);
    const read = (name: string | undefined): string | null => {
      const value = name && row ? (row[name] ?? "").trim() : "";
      return value === "" ? null : value;
    };
    return { role, id, found: row !== undefined, grade: read(grade), department: read(department) };
  };
  const idOf = (role: string): string | null => {
    const column = dataset.roleColumn("transactions", role);
    const value = column ? (cells[column.name] ?? "").trim() : "";
    return value === "" ? null : value;
  };
  const people: FlagPerson[] = [];
  const employee = idOf("employee_id");
  if (employee) people.push(person("employee", employee));
  const requester = idOf("requester_id");
  if (requester) people.push(person("requester", requester));
  for (const { id } of dataset.approverIds(index)) people.push(person("approver", id));
  return people;
}

/**
 * Who should hear about a flag: the band of the most senior person involved (by grade) crossed with
 * the severity. Without a known grade, the mid band is used and no basis is given.
 */
export function reportTo(input: {
  severity: Severity;
  people: readonly FlagPerson[];
  bands: SeniorityBands | null;
  matrix: ReportToMatrix;
}): Omit<ReportTo, "personId"> {
  let basis: ReportTo["basis"] = null;
  if (input.bands) {
    for (const person of input.people) {
      const grade = person.grade === null ? null : parseNumber(person.grade);
      if (grade !== null && (basis === null || grade > basis.grade)) {
        basis = { role: person.role, id: person.id, grade };
      }
    }
  }
  const band: SeniorityBand = basis && input.bands ? bandOf(basis.grade, input.bands) : "mid";
  const level = input.matrix[input.severity][SENIORITY_BANDS.indexOf(band)] ?? "hr_manager";
  return { level, severity: input.severity, band, basis };
}

/**
 * The person a level names: the employee's line manager, or the department head (the most senior
 * manager above the employee who is in the employee's department). HR levels name no one.
 */
export function reportToPerson(
  level: ReportToLevel,
  employeeId: string | null,
  dataset: PreparedDataset,
): string | null {
  if (employeeId === null || dataset.employee(employeeId) === undefined) return null;
  const chain = dataset.managerChain(employeeId) ?? [];
  if (level === "line_manager") return chain[0] ?? null;
  if (level !== "dept_head") return null;
  const column = dataset.roleColumn("employees", "department");
  if (!column) return null;
  const departmentOf = (id: string) => (dataset.employee(id)?.[column.name] ?? "").trim();
  const department = departmentOf(employeeId);
  if (department === "") return null;
  let head: string | null = null;
  for (const manager of chain) {
    if (departmentOf(manager) !== department) break;
    head = manager;
  }
  return head;
}
