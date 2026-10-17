import {
  PATTERN_CANDIDATES_FOR_AI,
  PATTERN_DETECTORS,
  PATTERN_FLAG_LIMIT,
  PATTERN_PER_DETECTOR_CANDIDATES,
  PATTERN_PER_DETECTOR_FLAGS,
  type ParameterValue,
  type PatternDetector,
  type PatternFact,
  type PresetId,
  type Severity,
} from "@hrcc/shared";
import type { PreparedDataset } from "./dataset.js";
import { ruleAmountLimit } from "./flags.js";
import { parseNumber } from "./profile.js";
import { DateValue, readCell, weekdayOf } from "./values.js";

/** A rule's amount limit, and the transaction types it applies to (null: every type). */
export interface RuleLimit {
  ruleId: string;
  limit: number;
  types: readonly string[] | null;
}

/** Activity code found unusual, with how strong the signal is; no rule is broken. */
export interface PatternCandidate {
  detector: PatternDetector;
  /** Who or what it is about: the same in a later run means the same pattern. */
  subject: string;
  /** The statistical score, 0 to 1. */
  strength: number;
  /** Aggregate facts; people by their IDs, which the API swaps for tokens before AI reads them. */
  facts: PatternFact[];
  /** 0-based rows it rests on, most telling first, at most 20. */
  rows: number[];
}

export interface RankedPattern extends PatternCandidate {
  /** Jev's concern, 0 to 1; null when code ranked it alone. */
  concern: number | null;
  combined: number;
  confidence: Severity;
}

const MAX_ROWS = 20;
/** Amounts from this share of a limit up to the limit sit just under it. */
const NEAR_SHARE = 0.9;
const MIN_POOL = 20;
const MIN_NEAR = 3;
const MIN_Z_NEAR = 2;
const MIN_PAIR_TRANSACTIONS = 8;
const MIN_PAIR_SHARE = 0.9;
const MIN_APPROVALS = 50;
const MIN_TEAM_APPROVALS = 20;
const MIN_Z_OFF_HOURS = 2.5;
/** Working hours, in minutes after midnight, Dubai time. */
const DAY_START = 7 * 60;
const DAY_END = 20 * 60;
const MIN_TEAM_DATED = 15;
const MIN_Z_BACKDATED = 3.5;
/** Submitted at least this long after taking effect, and this much later than the team's usual. */
const MIN_LATE_DAYS = 7;
const MIN_EXTRA_DAYS = 7;
/** A team whose gaps are nearly all the same still gets this much spread, in days. */
const MIN_SPREAD_DAYS = 2;
const MIN_TEAM_TRANSACTIONS = 50;
const RARE_COUNT = 2;
const RARE_SHARE = 0.02;
const SPLIT_WINDOW_DAYS = 7;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const round = (value: number, places = 4) => Math.round(value * 10 ** places) / 10 ** places;
/** A z-score as a strength: 0 at no signal, approaching 1 as the signal grows. */
const strengthOf = (z: number, scale: number) => round(clamp01(1 - Math.exp(-z / scale)));
/** A share as a percentage with one decimal. */
const pct = (share: number) => round(share * 100, 1);
const binomialZ = (k: number, n: number, p: number) => (k - n * p) / Math.sqrt(n * p * (1 - p));
const DETECTOR_ORDER = new Map(PATTERN_DETECTORS.map((detector, index) => [detector, index]));

function median(sorted: readonly number[]): number {
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** Strongest first; ties by subject, so the order never depends on how rows were read. */
function strongestFirst(candidates: PatternCandidate[]): PatternCandidate[] {
  return candidates.sort(
    (a, b) =>
      b.strength - a.strength ||
      (DETECTOR_ORDER.get(a.detector) ?? 0) - (DETECTOR_ORDER.get(b.detector) ?? 0) ||
      a.subject.localeCompare(b.subject),
  );
}

function grouped<K>(
  indexes: readonly number[],
  key: (index: number) => K | null,
): Map<K, number[]> {
  const groups = new Map<K, number[]>();
  for (const index of indexes) {
    const value = key(index);
    if (value === null) continue;
    const list = groups.get(value);
    if (list) list.push(index);
    else groups.set(value, [index]);
  }
  return groups;
}

/** Reads the roles detectors use; null where the data has no such role or the cell is empty. */
class Reader {
  readonly all: number[];
  constructor(readonly dataset: PreparedDataset) {
    this.all = dataset.rows.map((row) => row.index);
  }

  has(role: string): boolean {
    return this.dataset.roleColumn("transactions", role) !== undefined;
  }

  text(index: number, role: string): string | null {
    const column = this.dataset.roleColumn("transactions", role);
    const value = column ? (this.dataset.rows[index]?.cells[column.name] ?? "").trim() : "";
    return value === "" ? null : value;
  }

  amount(index: number): number | null {
    const raw = this.text(index, "amount");
    return raw === null ? null : parseNumber(raw);
  }

  date(index: number, role: string): DateValue | null {
    const column = this.dataset.roleColumn("transactions", role);
    if (!column) return null;
    const read = readCell(this.dataset.rows[index]?.cells[column.name], column);
    return read.ok && read.value instanceof DateValue ? read.value : null;
  }

  /** The transaction's department, or its employee's in the employees file. */
  department(index: number): string | null {
    const own = this.text(index, "department");
    if (own !== null) return own;
    const employee = this.text(index, "employee_id");
    const column = this.dataset.roleColumn("employees", "department");
    const value = employee && column ? (this.dataset.employee(employee)?.[column.name] ?? "") : "";
    return value.trim() === "" ? null : value.trim();
  }

  /** The transaction ID, or the row as people count rows. */
  label(index: number): string {
    const row = this.dataset.rows[index];
    return row?.transactionId ?? `row:${row?.rowNo ?? index + 1}`;
  }

  inTypes(index: number, types: readonly string[] | null): boolean {
    if (types === null) return true;
    const type = this.text(index, "type");
    return type !== null && types.includes(type);
  }
}

function justUnderLimit(reader: Reader, limits: readonly RuleLimit[]): PatternCandidate[] {
  if (!reader.has("requester_id") || !reader.has("amount")) return [];
  const found: PatternCandidate[] = [];
  for (const { ruleId, limit, types } of limits) {
    const pool = reader.all.filter(
      (index) => reader.inTypes(index, types) && reader.amount(index) !== null,
    );
    if (pool.length < MIN_POOL) continue;
    const near = (index: number) => {
      const amount = reader.amount(index) ?? 0;
      return amount >= NEAR_SHARE * limit && amount <= limit;
    };
    const p0 = pool.filter(near).length / pool.length;
    if (p0 <= 0 || p0 >= 0.5) continue;
    for (const [requester, rows] of grouped(pool, (index) => reader.text(index, "requester_id"))) {
      const nearRows = rows.filter(near);
      const z = binomialZ(nearRows.length, rows.length, p0);
      if (nearRows.length < MIN_NEAR || z < MIN_Z_NEAR) continue;
      found.push({
        detector: "just_under_limit",
        subject: `${ruleId}:${requester}`,
        strength: strengthOf(z, 4),
        facts: [
          { key: "rule", value: ruleId },
          { key: "limit", value: limit },
          { key: "requester", value: requester },
          { key: "near_limit", value: nearRows.length },
          { key: "of", value: rows.length },
          { key: "share_pct", value: pct(nearRows.length / rows.length) },
          { key: "everyone_pct", value: pct(p0) },
        ],
        rows: [...nearRows]
          .sort((a, b) => (reader.amount(b) ?? 0) - (reader.amount(a) ?? 0) || a - b)
          .slice(0, MAX_ROWS),
      });
    }
  }
  return found;
}

function dominantPair(reader: Reader): PatternCandidate[] {
  const { dataset } = reader;
  if (!reader.has("requester_id") || !reader.has("approver_ids")) return [];
  const approved = reader.all.filter((index) => dataset.approverIds(index).length > 0);
  const found: PatternCandidate[] = [];
  for (const [requester, rows] of grouped(approved, (index) =>
    reader.text(index, "requester_id"),
  )) {
    if (rows.length < MIN_PAIR_TRANSACTIONS) continue;
    const chain = dataset.managerChain(requester);
    if (chain === null) continue;
    const byApprover = new Map<string, number[]>();
    for (const index of rows) {
      for (const id of new Set(dataset.approverIds(index).map((item) => item.id))) {
        byApprover.set(id, [...(byApprover.get(id) ?? []), index]);
      }
    }
    const [approver, theirs] = [...byApprover].sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
    )[0] ?? ["", []];
    const share = theirs.length / rows.length;
    if (approver === "" || approver === requester || share < MIN_PAIR_SHARE) continue;
    if (chain.includes(approver)) continue;
    found.push({
      detector: "dominant_pair",
      subject: `${requester}:${approver}`,
      strength: round(clamp01(share * (1 - Math.exp(-rows.length / 10)))),
      facts: [
        { key: "requester", value: requester },
        { key: "approver", value: approver },
        { key: "approved", value: theirs.length },
        { key: "of", value: rows.length },
        { key: "share_pct", value: pct(share) },
        { key: "in_reporting_line", value: "no" },
      ],
      rows: theirs.slice(0, MAX_ROWS),
    });
  }
  return found;
}

function offHoursApprovals(reader: Reader): PatternCandidate[] {
  const { dataset } = reader;
  const { calendar } = dataset;
  const offHours = (value: DateValue) =>
    !calendar.workingWeekdays.has(weekdayOf(value.day)) ||
    calendar.holidays.has(value.day) ||
    (value.minute !== null && (value.minute < DAY_START || value.minute >= DAY_END));
  /** Per department: approvals, off-hours approvals, and the rows with one. */
  const teams = new Map<string, { approvals: number; off: number; rows: number[] }>();
  let approvals = 0;
  let off = 0;
  for (const index of reader.all) {
    const department = reader.department(index);
    if (department === null) continue;
    const times = dataset
      .approvalTimes(index)
      .flatMap(({ item }) =>
        item.kind === "value" && item.value instanceof DateValue ? [item.value] : [],
      );
    if (times.length === 0) continue;
    const team = teams.get(department) ?? { approvals: 0, off: 0, rows: [] };
    teams.set(department, team);
    const late = times.filter(offHours).length;
    team.approvals += times.length;
    team.off += late;
    if (late > 0) team.rows.push(index);
    approvals += times.length;
    off += late;
  }
  const p0 = approvals > 0 ? off / approvals : 0;
  if (approvals < MIN_APPROVALS || p0 <= 0 || p0 >= 0.5) return [];
  const found: PatternCandidate[] = [];
  for (const [department, team] of teams) {
    if (team.approvals < MIN_TEAM_APPROVALS) continue;
    const rate = team.off / team.approvals;
    const z = binomialZ(team.off, team.approvals, p0);
    if (rate < 2 * p0 || z < MIN_Z_OFF_HOURS) continue;
    found.push({
      detector: "off_hours_approvals",
      subject: department,
      strength: strengthOf(z, 4),
      facts: [
        { key: "department", value: department },
        { key: "off_hours", value: team.off },
        { key: "of", value: team.approvals },
        { key: "team_pct", value: pct(rate) },
        { key: "everyone_pct", value: pct(p0) },
      ],
      rows: team.rows.slice(0, MAX_ROWS),
    });
  }
  return found;
}

function backdating(reader: Reader, flagged: ReadonlySet<number>): PatternCandidate[] {
  if (!reader.has("effective_date") || !reader.has("submitted_at")) return [];
  const lagOf = new Map<number, number>();
  for (const index of reader.all) {
    const effective = reader.date(index, "effective_date");
    const submitted = reader.date(index, "submitted_at");
    if (effective && submitted) lagOf.set(index, submitted.day - effective.day);
  }
  const found: PatternCandidate[] = [];
  const dated = [...lagOf.keys()];
  for (const [department, rows] of grouped(dated, (index) => reader.department(index))) {
    if (rows.length < MIN_TEAM_DATED) continue;
    const lags = rows.map((index) => lagOf.get(index) ?? 0).sort((a, b) => a - b);
    const usual = median(lags);
    const spread = median(lags.map((lag) => Math.abs(lag - usual)).sort((a, b) => a - b));
    const scale = Math.max(1.4826 * spread, MIN_SPREAD_DAYS);
    for (const index of rows) {
      const lag = lagOf.get(index) ?? 0;
      const z = (lag - usual) / scale;
      // A transaction a rule flagged in this run is that rule's finding, not a pattern.
      if (flagged.has(index)) continue;
      if (lag < MIN_LATE_DAYS || lag - usual < MIN_EXTRA_DAYS || z < MIN_Z_BACKDATED) continue;
      found.push({
        detector: "backdating",
        subject: reader.label(index),
        strength: strengthOf(z, 6),
        facts: [
          { key: "transaction", value: reader.label(index) },
          { key: "department", value: department },
          { key: "days_late", value: lag },
          { key: "team_median_days", value: round(usual, 1) },
        ],
        rows: [index],
      });
    }
  }
  return found;
}

function rareType(reader: Reader, flagged: ReadonlySet<number>): PatternCandidate[] {
  if (!reader.has("type")) return [];
  const found: PatternCandidate[] = [];
  for (const [department, rows] of grouped(reader.all, (index) => reader.department(index))) {
    if (rows.length < MIN_TEAM_TRANSACTIONS) continue;
    for (const [type, ofType] of grouped(rows, (index) => reader.text(index, "type"))) {
      const share = ofType.length / rows.length;
      if (ofType.length > RARE_COUNT || share >= RARE_SHARE) continue;
      for (const index of ofType) {
        if (flagged.has(index)) continue;
        found.push({
          detector: "rare_type",
          subject: reader.label(index),
          strength: round(clamp01(Math.log10(1 / share) / 3)),
          facts: [
            { key: "transaction", value: reader.label(index) },
            { key: "type", value: type },
            { key: "department", value: department },
            { key: "count", value: ofType.length },
            { key: "of", value: rows.length },
            { key: "share_pct", value: pct(share) },
          ],
          rows: [index],
        });
      }
    }
  }
  return found;
}

function splitRequests(reader: Reader, limits: readonly RuleLimit[]): PatternCandidate[] {
  if (!reader.has("employee_id") || !reader.has("amount") || !reader.has("effective_date")) {
    return [];
  }
  const dayOf = (index: number) => reader.date(index, "effective_date")?.day ?? null;
  const found: PatternCandidate[] = [];
  for (const { ruleId, limit, types } of limits) {
    const under = reader.all.filter((index) => {
      const amount = reader.amount(index);
      return (
        reader.inTypes(index, types) && amount !== null && amount <= limit && dayOf(index) !== null
      );
    });
    // One request split in two has one reason: different allowances in a week aren't a split.
    const requests = grouped(under, (index) => {
      const employee = reader.text(index, "employee_id");
      return employee === null ? null : JSON.stringify([employee, reader.text(index, "text")]);
    });
    for (const [key, rows] of requests) {
      const [employee] = JSON.parse(key) as [string, string | null];
      const sorted = [...rows].sort((a, b) => (dayOf(a) ?? 0) - (dayOf(b) ?? 0) || a - b);
      let at = 0;
      while (at < sorted.length) {
        const first = sorted[at] ?? 0;
        const start = dayOf(first) ?? 0;
        let end = at;
        while (
          end + 1 < sorted.length &&
          (dayOf(sorted[end + 1] ?? 0) ?? 0) - start < SPLIT_WINDOW_DAYS
        ) {
          end += 1;
        }
        const group = sorted.slice(at, end + 1);
        const amounts = group.map((index) => reader.amount(index) ?? 0);
        const total = amounts.reduce((sum, amount) => sum + amount, 0);
        if (group.length >= 2 && total > limit) {
          found.push({
            detector: "split_requests",
            subject: `${ruleId}:${employee}:${reader.label(first)}`,
            strength: round(
              clamp01(
                0.4 + 0.3 * Math.min(1, total / limit - 1) + 0.1 * Math.min(3, group.length - 2),
              ),
            ),
            facts: [
              { key: "rule", value: ruleId },
              { key: "limit", value: limit },
              { key: "employee", value: employee },
              { key: "count", value: group.length },
              { key: "total", value: total },
              { key: "largest", value: Math.max(...amounts) },
              { key: "window_days", value: SPLIT_WINDOW_DAYS },
            ],
            rows: group.slice(0, MAX_ROWS),
          });
          at = end + 1;
        } else {
          at += 1;
        }
      }
    }
  }
  return found;
}

/**
 * Every unusual pattern code finds in the dataset, strongest first. A detector the data lacks the
 * roles for finds nothing. The same dataset, limits and flagged rows always give the same list.
 */
export function findPatterns(
  dataset: PreparedDataset,
  limits: readonly RuleLimit[],
  options: {
    /** Rows a rule flagged in this run: a single transaction there is a finding, not a pattern. */
    flaggedRows?: ReadonlySet<number>;
  } = {},
): PatternCandidate[] {
  const reader = new Reader(dataset);
  const flagged = options.flaggedRows ?? new Set<number>();
  return strongestFirst([
    ...justUnderLimit(reader, limits),
    ...dominantPair(reader),
    ...offHoursApprovals(reader),
    ...backdating(reader, flagged),
    ...rareType(reader, flagged),
    ...splitRequests(reader, limits),
  ]);
}

/** The amount limits of the rules that have one; rules with the same limit and types count once. */
export function limitsOf(
  rules: ReadonlyArray<{
    ruleId: string;
    preset: PresetId;
    values: Readonly<Record<string, ParameterValue>>;
  }>,
  amountColumn: string | null,
): RuleLimit[] {
  const seen = new Set<string>();
  const limits: RuleLimit[] = [];
  for (const rule of rules) {
    const limit = ruleAmountLimit(rule.preset, rule.values, amountColumn);
    if (limit === null || limit <= 0) continue;
    const listed = rule.values.types;
    const types = Array.isArray(listed) && listed.length > 0 ? [...listed] : null;
    const key = JSON.stringify([limit, types === null ? null : [...types].sort()]);
    if (seen.has(key)) continue;
    seen.add(key);
    limits.push({ ruleId: rule.ruleId, limit, types });
  }
  return limits;
}

export const patternKey = (candidate: Pick<PatternCandidate, "detector" | "subject">) =>
  `${candidate.detector}|${candidate.subject}`;

/** The first `total` items, at most `each` per detector, in the order given. */
function capped<T extends { detector: PatternDetector }>(
  ordered: readonly T[],
  each: number,
  total: number,
): T[] {
  const taken = new Map<PatternDetector, number>();
  const kept: T[] = [];
  for (const item of ordered) {
    if (kept.length >= total) break;
    const count = taken.get(item.detector) ?? 0;
    if (count >= each) continue;
    taken.set(item.detector, count + 1);
    kept.push(item);
  }
  return kept;
}

/** The candidates Jev is asked about: the strongest, a few per detector. */
export function preselect(candidates: readonly PatternCandidate[]): PatternCandidate[] {
  return capped(
    strongestFirst([...candidates]),
    PATTERN_PER_DETECTOR_CANDIDATES,
    PATTERN_CANDIDATES_FOR_AI,
  );
}

/**
 * The patterns to raise: code's strength, averaged with Jev's concern when there is one, a few per
 * detector, at most the flag limit. High confidence from 0.7, Medium from 0.45.
 */
export function rankPatterns(
  candidates: readonly PatternCandidate[],
  concerns: ReadonlyMap<string, number> | null,
): RankedPattern[] {
  const ranked = candidates.map((candidate): RankedPattern => {
    const concern = concerns?.get(patternKey(candidate)) ?? null;
    const combined = round(
      concern === null ? candidate.strength : 0.5 * candidate.strength + 0.5 * concern,
    );
    const confidence: Severity = combined >= 0.7 ? "High" : combined >= 0.45 ? "Medium" : "Low";
    return { ...candidate, concern, combined, confidence };
  });
  ranked.sort(
    (a, b) =>
      b.combined - a.combined ||
      (DETECTOR_ORDER.get(a.detector) ?? 0) - (DETECTOR_ORDER.get(b.detector) ?? 0) ||
      a.subject.localeCompare(b.subject),
  );
  return capped(ranked, PATTERN_PER_DETECTOR_FLAGS, PATTERN_FLAG_LIMIT);
}
