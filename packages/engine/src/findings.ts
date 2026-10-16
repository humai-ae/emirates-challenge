import {
  DEFAULT_FINDING_VALUES,
  type Evidence,
  FINDING_FIELDS,
  type FindingField,
  type FindingFormatValues,
  type Severity,
  type WorkedExample,
} from "@hrcc/shared";
import { detectDateFormat } from "./dates.js";

type Mapping = ReadonlyArray<FindingField | null>;

/** Column names each field answers to, written in plain lower-case words. */
const NAMES: Readonly<Record<FindingField, readonly string[]>> = {
  finding_id: ["finding id", "finding", "flag id", "exception id", "id"],
  transaction_id: ["transaction id", "transaction", "txn id", "tx id", "transaction ref"],
  rule_id: ["rule id", "rule", "policy rule", "rule ref", "rule number"],
  rule_title: ["rule title", "rule name", "title"],
  severity: ["severity", "priority", "risk", "risk level", "severity level"],
  description: ["description", "explanation", "details", "summary", "issue"],
  evidence: ["evidence", "facts", "supporting evidence"],
  owner: ["owner", "team", "owner team", "assigned team", "responsible team", "assigned to"],
  recommended_action: [
    "recommended action",
    "suggested fix",
    "suggested action",
    "action",
    "recommendation",
    "corrective action",
    "remediation",
  ],
  employee_id: ["employee id", "employee", "emp id"],
  transaction_type: ["transaction type", "type"],
  department: ["department", "dept"],
  effective_date: ["effective date", "date"],
  amount: ["amount", "amount aed", "value"],
  run_id: ["run id", "run"],
  status: ["status", "finding status", "state"],
};

function words(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The field each column most likely holds, by its name; each field once, other columns blank. */
export function proposeMapping(columns: readonly string[]): Array<FindingField | null> {
  const used = new Set<FindingField>();
  return columns.map((column) => {
    const name = words(column);
    const field = FINDING_FIELDS.find(
      (candidate) => !used.has(candidate) && NAMES[candidate].includes(name),
    );
    if (!field) return null;
    used.add(field);
    return field;
  });
}

/** How the worked examples write severity, finding IDs and dates. */
export function learnValues(
  examples: ReadonlyArray<readonly string[]>,
  mapping: Mapping,
): FindingFormatValues {
  const samples = (field: FindingField): string[] => {
    const index = mapping.indexOf(field);
    if (index < 0) return [];
    return examples.map((example) => (example[index] ?? "").trim()).filter(Boolean);
  };
  const severities = samples("severity");
  const all = (test: (value: string) => boolean) => severities.length > 0 && severities.every(test);
  const severity = all((value) => /^[HML]$/.test(value))
    ? "letter"
    : all((value) => /[A-Z]/.test(value) && value === value.toUpperCase())
      ? "upper"
      : all((value) => /[a-z]/.test(value) && value === value.toLowerCase())
        ? "lower"
        : "title";
  const id = samples("finding_id")
    .map((value) => /^(\D*)(\d+)$/.exec(value))
    .find((match) => match !== null);
  const dates = samples("effective_date");
  return {
    severity,
    findingIdPrefix: id ? (id[1] ?? "") : DEFAULT_FINDING_VALUES.findingIdPrefix,
    findingIdWidth: id ? (id[2] ?? "").length : DEFAULT_FINDING_VALUES.findingIdWidth,
    dateFormat: dates.length > 0 ? (detectDateFormat(dates)?.format ?? null) : null,
    status: samples("status")[0] ?? DEFAULT_FINDING_VALUES.status,
  };
}

/** One finding as the export writes it. */
export interface FindingRow {
  findingNo: number;
  transactionId: string | null;
  ruleId: string;
  ruleTitle: string;
  severity: Severity;
  description: string;
  evidence: readonly Evidence[];
  owner: string;
  recommendedAction: string;
  employeeId: string | null;
  transactionType: string | null;
  department: string | null;
  /** YYYY-MM-DD. */
  effectiveDate: string | null;
  amount: string | null;
  runId: string;
}

export function findingIdOf(findingNo: number, values: FindingFormatValues): string {
  return `${values.findingIdPrefix}${String(findingNo).padStart(values.findingIdWidth, "0")}`;
}

/** Evidence as one line: `field=value (condition); …`. */
export function formatEvidence(evidence: readonly Evidence[]): string {
  return evidence
    .map((item) => {
      const value = typeof item.value === "string" ? item.value : item.value.join(", ");
      return item.condition
        ? `${item.field}=${value} (${item.condition})`
        : `${item.field}=${value}`;
    })
    .join("; ");
}

function severityIn(severity: Severity, style: FindingFormatValues["severity"]): string {
  if (style === "upper") return severity.toUpperCase();
  if (style === "lower") return severity.toLowerCase();
  if (style === "letter") return severity.charAt(0);
  return severity;
}

/** A calendar date in the examples' format. */
function dayIn(day: string, format: string | null): string {
  const [year, month, date] = day.split("-");
  const written = format?.startsWith("DD/MM/YYYY")
    ? `${date}/${month}/${year}`
    : format?.startsWith("MM/DD/YYYY")
      ? `${month}/${date}/${year}`
      : day;
  return format?.endsWith("HH:mm") ? `${written} 00:00` : written;
}

const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/** A cell a spreadsheet won't run as a formula, quoted when it has to be. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) && !PLAIN_NUMBER.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) || /^\s|\s$/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function cellValue(
  row: FindingRow,
  field: FindingField | null,
  values: FindingFormatValues,
): string {
  switch (field) {
    case "finding_id":
      return findingIdOf(row.findingNo, values);
    case "transaction_id":
      return row.transactionId ?? "";
    case "rule_id":
      return row.ruleId;
    case "rule_title":
      return row.ruleTitle;
    case "severity":
      return severityIn(row.severity, values.severity);
    case "description":
      return row.description;
    case "evidence":
      return formatEvidence(row.evidence);
    case "owner":
      return row.owner;
    case "recommended_action":
      return row.recommendedAction;
    case "employee_id":
      return row.employeeId ?? "";
    case "transaction_type":
      return row.transactionType ?? "";
    case "department":
      return row.department ?? "";
    case "effective_date":
      return row.effectiveDate ? dayIn(row.effectiveDate, values.dateFormat) : "";
    case "amount":
      return row.amount ?? "";
    case "run_id":
      return row.runId;
    case "status":
      return values.status;
    case null:
      return "";
  }
}

/** The findings as CSV in the format's own columns, order and value styles. */
export function renderFindingsCsv(
  columns: readonly string[],
  mapping: Mapping,
  values: FindingFormatValues,
  rows: readonly FindingRow[],
): string {
  const lines = [
    columns.map(cell).join(","),
    ...rows.map((row) => mapping.map((field) => cell(cellValue(row, field, values))).join(",")),
  ];
  return `${lines.join("\n")}\n`;
}

/** "R-01", "r01" and "R01" name the same rule. */
export function ruleKey(id: string): string {
  return id.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function flaggedKey(transactionId: string, ruleId: string): string {
  return `${transactionId}|${ruleKey(ruleId)}`;
}

/** Whether the run found each worked example of the format, and if not, why not. */
export function checkWorkedExamples(
  examples: ReadonlyArray<readonly string[]>,
  mapping: Mapping,
  run: {
    ruleIds: readonly string[];
    flagged: ReadonlySet<string>;
    transactionIds: ReadonlySet<string>;
  },
): WorkedExample[] {
  const transactionColumn = mapping.indexOf("transaction_id");
  const ruleColumn = mapping.indexOf("rule_id");
  const rules = new Set(run.ruleIds.map(ruleKey));
  return examples.map((example, index): WorkedExample => {
    const transactionId = (example[transactionColumn] ?? "").trim();
    const ruleId = (example[ruleColumn] ?? "").trim();
    const result: WorkedExample["result"] =
      !transactionId || !ruleId
        ? "incomplete"
        : !run.transactionIds.has(transactionId)
          ? "transaction_not_found"
          : !rules.has(ruleKey(ruleId))
            ? "rule_not_run"
            : run.flagged.has(flaggedKey(transactionId, ruleId))
              ? "found"
              : "not_flagged";
    return { row: index + 1, transactionId, ruleId, result };
  });
}
