import type { ColumnType, DatasetFileKind } from "@hrcc/shared";
import type { CsvTable } from "./csv.js";
import { type ColumnProfile, nameTokens } from "./profile.js";

export interface RoleAssignment {
  role: string;
  /** In file order; more than one only for multi-column roles such as approver_ids. */
  columns: string[];
  /** 0–1: how well the columns' names, types and values fit the role. */
  score: number;
  /** Strong and clearly ahead of the alternatives; otherwise the admin is asked to check it. */
  confident: boolean;
  /** Chosen by the admin rather than detected. */
  confirmed: boolean;
}

export type RoleOverrides = Partial<Record<string, readonly string[]>>;

interface RoleSpec {
  role: string;
  types: readonly ColumnType[];
  synonyms: readonly string[];
  /** Several columns may share the role (approver_1_id, approver_2_id), or one list column. */
  multi?: true;
  /** Values should be employee IDs from the employees file. */
  employeeRef?: true;
  /** Values should be unique: the file's own identifier. */
  unique?: true;
}

const REFERENCE_TYPES: readonly ColumnType[] = ["id", "integer", "category", "text"];
const DATE_TYPES: readonly ColumnType[] = ["date", "datetime"];
const GRADE: RoleSpec = {
  role: "grade",
  types: ["integer", "category", "text"],
  synonyms: ["grade", "employee grade", "job grade", "level", "band"],
};
const DEPARTMENT: RoleSpec = {
  role: "department",
  types: ["category", "text"],
  synonyms: ["department", "dept", "division", "business unit", "unit"],
};

const ROLE_SPECS: Record<DatasetFileKind, readonly RoleSpec[]> = {
  transactions: [
    {
      role: "transaction_id",
      types: ["id", "integer", "text"],
      synonyms: [
        "transaction id",
        "txn id",
        "tx id",
        "transaction ref",
        "transaction reference",
        "transaction number",
        "txn ref",
        "reference",
        "ref",
        "id",
      ],
      unique: true,
    },
    {
      role: "type",
      types: ["category", "text"],
      synonyms: [
        "type",
        "transaction type",
        "txn type",
        "change type",
        "action type",
        "request type",
        "category",
      ],
    },
    {
      role: "employee_id",
      types: REFERENCE_TYPES,
      synonyms: [
        "employee id",
        "emp id",
        "employee",
        "staff id",
        "employee number",
        "employee no",
        "subject employee",
      ],
      employeeRef: true,
    },
    {
      role: "requester_id",
      types: REFERENCE_TYPES,
      synonyms: [
        "requester id",
        "requester",
        "requestor",
        "requested by",
        "initiator",
        "initiated by",
        "raised by",
        "submitted by",
        "created by",
      ],
      employeeRef: true,
    },
    {
      role: "approver_ids",
      types: [...REFERENCE_TYPES, "list"],
      synonyms: ["approver ids", "approver id", "approvers", "approver", "approved by"],
      employeeRef: true,
      multi: true,
    },
    {
      role: "amount",
      types: ["number", "integer"],
      synonyms: [
        "amount",
        "value",
        "amount aed",
        "total",
        "change amount",
        "pay change amount",
        "allowance amount",
      ],
    },
    {
      role: "currency",
      types: ["category", "text"],
      synonyms: ["currency", "ccy", "currency code"],
    },
    {
      role: "effective_date",
      types: DATE_TYPES,
      synonyms: [
        "effective date",
        "effective",
        "effective from",
        "effective on",
        "eff date",
        "start date",
      ],
    },
    {
      role: "submitted_at",
      types: DATE_TYPES,
      synonyms: [
        "submitted at",
        "submitted",
        "submitted on",
        "submission date",
        "request date",
        "requested at",
        "requested on",
        "created at",
      ],
    },
    {
      role: "approved_at",
      types: DATE_TYPES,
      synonyms: ["approved at", "approved", "approved on", "approval date", "decision date"],
    },
    {
      role: "documents",
      types: ["list", "text", "category"],
      synonyms: [
        "documents",
        "documents attached",
        "attachments",
        "attached documents",
        "docs",
        "supporting documents",
      ],
    },
    GRADE,
    DEPARTMENT,
    {
      role: "text",
      types: ["text", "category"],
      synonyms: [
        "justification",
        "reason",
        "business reason",
        "comment",
        "comments",
        "notes",
        "description",
        "remarks",
      ],
    },
  ],
  employees: [
    {
      role: "employee_id",
      types: ["id", "integer", "text"],
      synonyms: ["employee id", "emp id", "staff id", "employee number", "employee no", "id"],
      unique: true,
    },
    GRADE,
    DEPARTMENT,
    {
      role: "location",
      types: ["category", "text"],
      synonyms: ["location", "base", "station", "city", "office", "site", "country"],
    },
    {
      role: "manager_id",
      types: REFERENCE_TYPES,
      synonyms: [
        "manager id",
        "manager",
        "line manager",
        "line manager id",
        "reports to",
        "supervisor",
        "supervisor id",
      ],
      employeeRef: true,
    },
    {
      role: "hire_date",
      types: DATE_TYPES,
      synonyms: [
        "hire date",
        "hired",
        "hired on",
        "date of joining",
        "joining date",
        "join date",
        "joined",
        "start date",
      ],
    },
    {
      role: "exit_date",
      types: DATE_TYPES,
      synonyms: [
        "exit date",
        "exit",
        "termination date",
        "leaving date",
        "leave date",
        "end date",
        "exited",
      ],
    },
  ],
};

const WEAK_WORDS = new Set([
  "id",
  "ids",
  "date",
  "at",
  "on",
  "by",
  "of",
  "the",
  "no",
  "number",
  "code",
]);
const MIN_SCORE = 0.3;
const CONFIDENT_SCORE = 0.75;
const CONFIDENT_MARGIN = 0.15;

/** Name words without numbers: "approver_2_id" → ["approver", "id"]. */
function words(name: string): string[] {
  return nameTokens(name).filter((token) => !/^\d+$/.test(token));
}

function nameScore(name: string, synonyms: readonly string[]): number {
  const columnWords = words(name);
  const joined = columnWords.join(" ");
  let best = 0;
  for (const synonym of synonyms) {
    const target = words(synonym);
    if (joined === target.join(" ")) return 1;
    // Weak words alone ("id", "date") only count as an exact match.
    if (target.every((word) => WEAK_WORDS.has(word))) continue;
    if (target.every((word) => columnWords.includes(word))) {
      best = Math.max(best, 0.8);
    } else if (
      columnWords.some((word) => !WEAK_WORDS.has(word)) &&
      columnWords.every((word) => target.includes(word))
    ) {
      best = Math.max(best, 0.7);
    } else if (target.some((word) => !WEAK_WORDS.has(word) && columnWords.includes(word))) {
      best = Math.max(best, 0.4);
    }
  }
  return best;
}

interface Candidate {
  columns: ColumnProfile[];
  /** The name scored against the synonyms: the column's, or a numbered group's shared stem. */
  label: string;
}

function candidatesFor(spec: RoleSpec, profiles: readonly ColumnProfile[]): Candidate[] {
  const compatible = profiles.filter((profile) => spec.types.includes(profile.type));
  const singles = compatible.map((profile) => ({ columns: [profile], label: profile.name }));
  if (!spec.multi) return singles;
  const groups = new Map<string, ColumnProfile[]>();
  for (const profile of compatible) {
    if (!nameTokens(profile.name).some((token) => /^\d+$/.test(token))) continue;
    const stem = words(profile.name).join(" ");
    groups.set(stem, [...(groups.get(stem) ?? []), profile]);
  }
  const grouped = [...groups.entries()]
    .filter(([, columns]) => columns.length > 1)
    .map(([stem, columns]) => ({ columns, label: stem }));
  // A numbered column competes only as part of its group, so the group is never split.
  const inGroups = new Set(
    grouped.flatMap((group) => group.columns.map((profile) => profile.name)),
  );
  return [...grouped, ...singles.filter((single) => !inGroups.has(single.label))];
}

/** Non-blank values of a column, with list columns split into their items. */
export function columnValues(table: CsvTable, profile: ColumnProfile): string[] {
  const values: string[] = [];
  for (const row of table.rows) {
    const value = row[profile.position] ?? "";
    if (value === "") continue;
    if (profile.listDelimiter) {
      for (const part of value.split(profile.listDelimiter)) {
        if (part.trim() !== "") values.push(part.trim());
      }
    } else {
      values.push(value);
    }
  }
  return values;
}

function scoreOf(
  spec: RoleSpec,
  candidate: Candidate,
  table: CsvTable,
  employeeIds: ReadonlySet<string> | undefined,
): number {
  const name = nameScore(candidate.label, spec.synonyms);
  let score = name;
  if (spec.employeeRef && employeeIds && employeeIds.size > 0) {
    const values = candidate.columns.flatMap((profile) => columnValues(table, profile));
    const known = values.filter((value) => employeeIds.has(value)).length;
    score = 0.6 * name + 0.4 * (values.length === 0 ? 0 : known / values.length);
  }
  if (spec.unique) {
    const [profile] = candidate.columns;
    const filled = profile ? table.rows.length - profile.blankCount : 0;
    if (!profile || filled === 0 || profile.distinctCount < filled * 0.98) score *= 0.5;
  }
  return Math.round(score * 100) / 100;
}

export function assignRoles(
  file: DatasetFileKind,
  table: CsvTable,
  profiles: readonly ColumnProfile[],
  context: { employeeIds?: ReadonlySet<string> } = {},
  overrides?: RoleOverrides,
): RoleAssignment[] {
  const specs = ROLE_SPECS[file];
  const position = new Map(profiles.map((profile) => [profile.name, profile.position]));
  if (overrides) {
    return specs.flatMap((spec) => {
      const columns = overrides[spec.role];
      if (!columns || columns.length === 0) return [];
      const ordered = [...columns].sort((a, b) => (position.get(a) ?? 0) - (position.get(b) ?? 0));
      return [{ role: spec.role, columns: ordered, score: 1, confident: true, confirmed: true }];
    });
  }
  const scored = specs
    .flatMap((spec, specIndex) =>
      candidatesFor(spec, profiles).map((candidate) => ({
        spec,
        specIndex,
        candidate,
        score: scoreOf(spec, candidate, table, context.employeeIds),
      })),
    )
    .filter((entry) => entry.score >= MIN_SCORE)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.specIndex - b.specIndex ||
        b.candidate.columns.length - a.candidate.columns.length ||
        (a.candidate.columns[0]?.position ?? 0) - (b.candidate.columns[0]?.position ?? 0),
    );
  const taken = new Set<string>();
  const assigned = new Map<string, RoleAssignment>();
  for (const entry of scored) {
    if (assigned.has(entry.spec.role)) continue;
    const names = entry.candidate.columns.map((profile) => profile.name);
    if (names.some((name) => taken.has(name))) continue;
    for (const name of names) taken.add(name);
    const runnerUp =
      scored.find(
        (other) =>
          other.spec.role === entry.spec.role &&
          other.candidate.columns.every((profile) => !names.includes(profile.name)),
      )?.score ?? 0;
    assigned.set(entry.spec.role, {
      role: entry.spec.role,
      columns: names,
      score: entry.score,
      confident: entry.score >= CONFIDENT_SCORE && entry.score - runnerUp >= CONFIDENT_MARGIN,
      confirmed: false,
    });
  }
  return specs.flatMap((spec) => assigned.get(spec.role) ?? []);
}
