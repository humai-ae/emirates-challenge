import {
  datasetBands,
  dubaiDay,
  dueDateFor,
  explainPattern,
  flagPeople,
  namedPerson,
  type PreparedDataset,
  patternFollowUp,
  patternTitle,
  type RankedPattern,
  reportTo,
  reportToPerson,
} from "@hrcc/engine";
import {
  DEFAULT_FLAG_SETTINGS,
  type FlagPattern,
  type FlagPerson,
  PATTERN_CODES,
  type Severity,
  type SeverityReason,
  type TeamSummary,
} from "@hrcc/shared";
import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { SYSTEM_ACTOR } from "../audit/actor.js";
import { type AuditInput, AuditService } from "../audit/audit.service.js";
import type { LoadedDataset } from "../rules/check-datasets.service.js";
import {
  cellsOf,
  LINKABLE_STATUSES,
  nextFlagIds,
  type RunFlagsCount,
  SEVERITY_ORDER,
} from "./flag-creation.service.js";

export interface PatternFlagsInput {
  runId: string;
  at: Date;
  dataset: LoadedDataset;
  /** The owner team of each transaction type when the run started. */
  routing: Readonly<Record<string, TeamSummary>>;
  /** The patterns to raise, as the ranking gave them. */
  ranked: readonly RankedPattern[];
  /** AI rewrites the new flags' texts: they start as "pending". */
  writing: boolean;
}

const MAX_PEOPLE = 10;

/** A transaction's cell for a role, or its employee's department; null when empty. */
function cellOf(prepared: PreparedDataset, index: number, role: string): string | null {
  const column = prepared.roleColumn("transactions", role);
  const value = column ? (prepared.rows[index]?.cells[column.name] ?? "").trim() : "";
  return value === "" ? null : value;
}

function departmentOf(prepared: PreparedDataset, index: number): string | null {
  const own = cellOf(prepared, index, "department");
  if (own !== null) return own;
  const employee = cellOf(prepared, index, "employee_id");
  const column = prepared.roleColumn("employees", "department");
  const value = employee && column ? (prepared.employee(employee)?.[column.name] ?? "") : "";
  return value.trim() === "" ? null : value.trim();
}

/** Everyone the pattern's transactions involve, once each, at most ten. */
function uniquePeople(people: readonly FlagPerson[]): FlagPerson[] {
  const seen = new Set<string>();
  return people
    .filter((person) => {
      const key = `${person.role}|${person.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_PEOPLE);
}

/**
 * Turns ranked patterns into flags. A pattern breaks no rule, so its severity follows how sure the
 * ranking is (Medium at High confidence, else Low), it goes to the team of its one transaction
 * type or to none, and its texts say what looks unusual and what to look into.
 */
@Injectable()
export class PatternFlagsService {
  constructor(private readonly audit: AuditService) {}

  /**
   * Raises a flag for each pattern, unless an open or dismissed flag has the same pattern and
   * subject: that flag records it as seen again. Runs inside the caller's transaction.
   */
  async raise(manager: EntityManager, input: PatternFlagsInput): Promise<RunFlagsCount> {
    if (input.ranked.length === 0) return { newFlags: 0, seenAgain: 0, created: [] };
    const prepared = input.dataset.prepared;
    const codes = [...new Set(input.ranked.map((pattern) => PATTERN_CODES[pattern.detector]))];
    // Locked, so a decision committed meanwhile wins, and a flag closed meanwhile takes no repeat.
    const linkable: Array<{ id: string; rule_id: string; subject: string }> = await manager.query(
      `SELECT id, rule_id, pattern->>'subject' AS subject FROM flags
       WHERE kind = 'unusual_pattern' AND rule_id = ANY($1) AND status = ANY($2)
       ORDER BY id FOR UPDATE`,
      [codes, [...LINKABLE_STATUSES]],
    );
    const existing = new Map(linkable.map((row) => [`${row.rule_id}|${row.subject}`, row.id]));
    const seen: string[] = [];
    const fresh: RankedPattern[] = [];
    for (const pattern of input.ranked) {
      const id = existing.get(`${PATTERN_CODES[pattern.detector]}|${pattern.subject}`);
      if (id) seen.push(id);
      else fresh.push(pattern);
    }

    const ids = await nextFlagIds(manager, fresh.length);
    const settings = DEFAULT_FLAG_SETTINGS;
    const bands = settings.bands ?? datasetBands(prepared);
    const columns = prepared.columnNames("transactions");
    const day = dubaiDay(input.at);
    const rows = fresh.map((pattern, at) => {
      const first = pattern.rows[0] ?? 0;
      const row = prepared.rows[first];
      const people = uniquePeople(pattern.rows.flatMap((index) => flagPeople(prepared, index)));
      const types = new Set(pattern.rows.map((index) => cellOf(prepared, index, "type")));
      const [onlyType] = types.size === 1 ? [...types] : [null];
      const owner = onlyType ? (input.routing[onlyType] ?? null) : null;
      const severity: Severity = pattern.confidence === "High" ? "Medium" : "Low";
      const reasons: SeverityReason[] = [
        { code: "pattern_confidence", confidence: pattern.confidence },
      ];
      const employeeId = cellOf(prepared, first, "employee_id");
      const report = reportTo({ severity, people, bands, matrix: settings.reportTo });
      const lineManagerId = reportToPerson("line_manager", employeeId, prepared);
      const deptHeadId = reportToPerson("dept_head", employeeId, prepared);
      const explanationEn = explainPattern(pattern, "en");
      const explanationAr = explainPattern(pattern, "ar");
      const followUpEn = patternFollowUp(pattern.detector, "en");
      const followUpAr = patternFollowUp(pattern.detector, "ar");
      const stored: FlagPattern = {
        detector: pattern.detector,
        subject: pattern.subject,
        strength: pattern.strength,
        concern: pattern.concern,
        combined: pattern.combined,
        facts: pattern.facts.slice(0, 12),
        transactions: pattern.rows.slice(0, 20).map((index) => ({
          id: prepared.rows[index]?.transactionId ?? null,
          rowNo: prepared.rows[index]?.rowNo ?? index + 1,
        })),
      };
      return {
        id: ids[at] ?? "",
        kind: "unusual_pattern",
        confidence: pattern.confidence,
        pattern: stored,
        writing: input.writing ? "pending" : "none",
        rule_id: PATTERN_CODES[pattern.detector],
        rule_version: 1,
        rule_title: patternTitle(pattern.detector, "en"),
        transaction_ids: stored.transactions.flatMap((item) => (item.id ? [item.id] : [])),
        row_no: row?.rowNo ?? first + 1,
        transaction_type: cellOf(prepared, first, "type"),
        department: departmentOf(prepared, first),
        employee_id: employeeId,
        requester_id: cellOf(prepared, first, "requester_id"),
        transaction: cellsOf(columns, row?.cells ?? {}),
        people,
        evidence: pattern.facts.map((fact) => ({
          field: fact.key,
          value: String(fact.value),
          condition: "",
        })),
        explanation_en: explanationEn,
        explanation_ar: explanationAr,
        suggested_fix_en: followUpEn,
        suggested_fix_ar: followUpAr,
        standard_explanation_en: explanationEn,
        standard_explanation_ar: explanationAr,
        standard_fix_en: followUpEn,
        standard_fix_ar: followUpAr,
        severity,
        severity_reasons: reasons,
        owner_team_id: owner?.id ?? null,
        owner_name: owner?.nameEn ?? null,
        due_date: dueDateFor(day, severity, settings.dueDays),
        report_to: {
          ...report,
          personId: namedPerson(report.level, lineManagerId, deptHeadId),
          lineManagerId,
          deptHeadId,
        },
      };
    });

    if (rows.length > 0) {
      await manager.query(
        `INSERT INTO flags (id, run_id, result_seq, kind, confidence, judgment, pattern, writing,
           status, rule_id, rule_version, rule_title, transaction_ids, row_no, transaction_type,
           department, employee_id, requester_id, transaction, people, evidence, explanation_en,
           explanation_ar, suggested_fix_en, suggested_fix_ar, standard_explanation_en,
           standard_explanation_ar, standard_fix_en, standard_fix_ar, severity, severity_reasons,
           owner_team_id, due_date, report_to, created_at, updated_at)
         SELECT r.id, $1, NULL, r.kind, r.confidence, NULL, r.pattern, r.writing, 'with_analyst',
           r.rule_id, r.rule_version, r.rule_title, r.transaction_ids, r.row_no,
           r.transaction_type, r.department, r.employee_id, r.requester_id, r.transaction,
           r.people, r.evidence, r.explanation_en, r.explanation_ar, r.suggested_fix_en,
           r.suggested_fix_ar, r.standard_explanation_en, r.standard_explanation_ar,
           r.standard_fix_en, r.standard_fix_ar, r.severity, r.severity_reasons, r.owner_team_id,
           r.due_date, r.report_to, $2, $2
         FROM jsonb_to_recordset($3::jsonb) AS r(
           id text, kind text, confidence text, pattern jsonb, writing text, rule_id text,
           rule_version integer, rule_title text, transaction_ids text[], row_no integer,
           transaction_type text, department text, employee_id text, requester_id text,
           transaction jsonb, people jsonb, evidence jsonb, explanation_en text,
           explanation_ar text, suggested_fix_en text, suggested_fix_ar text,
           standard_explanation_en text, standard_explanation_ar text, standard_fix_en text,
           standard_fix_ar text, severity text, severity_reasons jsonb, owner_team_id uuid,
           due_date date, report_to jsonb
         )`,
        [input.runId, input.at, JSON.stringify(rows)],
      );
    }
    if (seen.length > 0) {
      // A repeat isn't a decision, so the row version stays: an open decision is still valid.
      await manager.query(
        `UPDATE flags
         SET seen_again = seen_again || jsonb_build_array(jsonb_build_object('runId', $2::text, 'at', $3::text))
         WHERE id = ANY($1)`,
        [seen, input.runId, input.at.toISOString()],
      );
    }
    const events: AuditInput[] = [
      ...rows.map(
        (row): AuditInput => ({
          actor: SYSTEM_ACTOR,
          action: "flag.create",
          objectType: "flag",
          objectId: row.id,
          after: {
            name: row.id,
            run: input.runId,
            kind: row.kind,
            ruleId: row.rule_id,
            transactionId: row.transaction_ids[0] ?? null,
            severity: row.severity,
            owner: row.owner_name,
            dueDate: row.due_date,
            reportTo: row.report_to.level,
          },
        }),
      ),
      ...seen.map(
        (id): AuditInput => ({
          actor: SYSTEM_ACTOR,
          action: "flag.seen_again",
          objectType: "flag",
          objectId: id,
          after: { name: id, run: input.runId },
        }),
      ),
    ];
    await this.audit.appendMany(manager, events, input.at);
    const created = rows
      .map((row) => ({ id: row.id, severity: row.severity }))
      .sort(
        (a, b) =>
          SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.id.localeCompare(b.id),
      );
    return { newFlags: rows.length, seenAgain: seen.length, created };
  }
}
