import {
  datasetBands,
  dubaiDay,
  dueDateFor,
  explainFinding,
  explainJudgment,
  flaggedKey,
  flagPeople,
  flagSeverity,
  namedPerson,
  parseNumber,
  reportTo,
  reportToPerson,
  ruleAmountLimit,
  ruleKey,
} from "@hrcc/engine";
import {
  DEFAULT_FLAG_SETTINGS,
  type FlagPerson,
  type FlagStatus,
  OPEN_FLAG_STATUSES,
  type Severity,
  type TeamSummary,
} from "@hrcc/shared";
import { Injectable } from "@nestjs/common";
import { type EntityManager, In } from "typeorm";
import { SYSTEM_ACTOR } from "../audit/actor.js";
import { type AuditInput, AuditService } from "../audit/audit.service.js";
import {
  FlagEntity,
  type RunResultEntity,
  type RunRuleSnapshot,
  type StoredCell,
} from "../database/entities/index.js";
import type { LoadedDataset } from "../rules/check-datasets.service.js";

/** Flags per INSERT; each statement sends its rows as one jsonb parameter. */
const CHUNK = 1_000;

/**
 * A finding repeating one of these flags, with the same cells, is linked to it: an open flag, or a
 * dismissed one (the same unchanged row needs no second decision). A closed flag's repeat is new.
 */
const LINKABLE_STATUSES: readonly FlagStatus[] = [...OPEN_FLAG_STATUSES, "dismissed"];

type Finding = Omit<RunResultEntity, "runId">;

export interface RunFlagsInput {
  runId: string;
  at: Date;
  dataset: LoadedDataset;
  rules: readonly RunRuleSnapshot[];
  /** The owner team of each transaction type when the run started. */
  routing: Readonly<Record<string, TeamSummary>>;
  results: readonly Finding[];
  /** AI rewrites the new flags' texts: they start as "pending". */
  writing: boolean;
}

export interface RunFlagsCount {
  newFlags: number;
  seenAgain: number;
  /** The new flags, most severe first: what AI rewrites first. */
  created: Array<{ id: string; severity: Severity }>;
}

const SEVERITY_ORDER: Readonly<Record<Severity, number>> = { High: 0, Medium: 1, Low: 2 };

interface Draft {
  id: string;
  finding: Finding;
  rule: RunRuleSnapshot;
  transaction: StoredCell[];
  people: FlagPerson[];
  requesterId: string | null;
}

/**
 * The transaction's cells in file order: rows come back from jsonb with their keys in jsonb's
 * order, so the dataset's columns give the order.
 */
function cellsOf(
  columns: readonly string[],
  cells: Readonly<Record<string, string>>,
): StoredCell[] {
  return columns.map((column) => ({ column, value: cells[column] ?? "" }));
}

/** Cell by cell: jsonb gives back each cell's keys in its own order. */
function sameCells(a: readonly StoredCell[], b: readonly StoredCell[]): boolean {
  return (
    a.length === b.length &&
    a.every((cell, index) => cell.column === b[index]?.column && cell.value === b[index]?.value)
  );
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

async function nextFlagIds(manager: EntityManager, count: number): Promise<string[]> {
  if (count === 0) return [];
  const rows: Array<{ n: string }> = await manager.query(
    "SELECT nextval('flag_seq') AS n FROM generate_series(1, $1) ORDER BY 1",
    [count],
  );
  return rows.map((row) => `F-${String(row.n).padStart(6, "0")}`);
}

@Injectable()
export class FlagCreationService {
  constructor(private readonly audit: AuditService) {}

  /**
   * Raises a flag for each finding of the run, unless the finding repeats an open or dismissed flag
   * (same rule, transaction and cells): that flag records it as seen again. Runs inside the run's
   * transaction.
   */
  async createForRun(manager: EntityManager, input: RunFlagsInput): Promise<RunFlagsCount> {
    const findings = input.results.filter((result) => result.outcome === "flagged");
    if (findings.length === 0) return { newFlags: 0, seenAgain: 0, created: [] };
    const prepared = input.dataset.prepared;
    const settings = DEFAULT_FLAG_SETTINGS;
    const bands = settings.bands ?? datasetBands(prepared);
    const rules = new Map(input.rules.map((rule) => [rule.ruleId, rule]));
    const linkable = await manager.find(FlagEntity, {
      where: { status: In([...LINKABLE_STATUSES]) },
      select: {
        id: true,
        status: true,
        ruleId: true,
        transactionIds: true,
        transaction: true,
        employeeId: true,
        requesterId: true,
      },
    });
    const open = linkable.filter((flag) => OPEN_FLAG_STATUSES.includes(flag.status));
    const columns = prepared.columnNames("transactions");
    const linkableByFinding = new Map<string, FlagEntity[]>();
    for (const flag of linkable) {
      for (const transactionId of flag.transactionIds) {
        push(linkableByFinding, flaggedKey(transactionId, flag.ruleId), flag);
      }
    }
    const matched = findings.flatMap((finding) => {
      const rule = rules.get(finding.ruleId);
      if (!rule) return [];
      const transaction = cellsOf(columns, prepared.rows[finding.rowNo - 1]?.cells ?? {});
      const repeats = finding.transactionId
        ? linkableByFinding
            .get(flaggedKey(finding.transactionId, finding.ruleId))
            ?.find((flag) => sameCells(flag.transaction, transaction))
        : undefined;
      return [{ finding, rule, transaction, repeats }];
    });
    // Lock the repeated flags and read their status again: a decision committed meanwhile wins,
    // and a flag closed meanwhile no longer takes the repeat.
    const repeatedIds = [
      ...new Set(matched.flatMap(({ repeats }) => (repeats ? [repeats.id] : []))),
    ];
    const locked: Array<{ id: string }> =
      repeatedIds.length > 0
        ? await manager.query(
            "SELECT id FROM flags WHERE id = ANY($1) AND status = ANY($2) ORDER BY id FOR UPDATE",
            [repeatedIds, [...LINKABLE_STATUSES]],
          )
        : [];
    const stillLinkable = new Set(locked.map((row) => row.id));

    const seen: FlagEntity[] = [];
    const fresh: Array<Omit<Draft, "id">> = [];
    for (const { finding, rule, transaction, repeats } of matched) {
      if (repeats && stillLinkable.has(repeats.id)) {
        seen.push(repeats);
        continue;
      }
      const people = flagPeople(prepared, finding.rowNo - 1);
      fresh.push({
        finding,
        rule,
        transaction,
        people,
        requesterId: people.find((person) => person.role === "requester")?.id ?? null,
      });
    }

    // IDs first, so a repeat on the same rule can name the other flag.
    const ids = await nextFlagIds(manager, fresh.length);
    const drafts: Draft[] = fresh.map((draft, index) => ({ ...draft, id: ids[index] ?? "" }));
    const byPerson = new Map<string, string[]>();
    const personKey = (ruleId: string, person: "employee" | "requester", personId: string) =>
      `${ruleKey(ruleId)}|${person}|${personId}`;
    const note = (
      ruleId: string,
      person: "employee" | "requester",
      personId: string | null,
      flagId: string,
    ) => {
      if (personId) push(byPerson, personKey(ruleId, person, personId), flagId);
    };
    for (const flag of open) {
      note(flag.ruleId, "employee", flag.employeeId, flag.id);
      note(flag.ruleId, "requester", flag.requesterId, flag.id);
    }
    for (const draft of drafts) {
      note(draft.rule.ruleId, "employee", draft.finding.employeeId, draft.id);
      note(draft.rule.ruleId, "requester", draft.requesterId, draft.id);
    }
    const repeatOf = (draft: Draft) => {
      for (const person of ["employee", "requester"] as const) {
        const personId = person === "employee" ? draft.finding.employeeId : draft.requesterId;
        if (!personId) continue;
        const other = byPerson
          .get(personKey(draft.rule.ruleId, person, personId))
          ?.find((id) => id !== draft.id);
        if (other) return { flagId: other, person, personId };
      }
      return null;
    };

    const day = dubaiDay(input.at);
    const amountColumn = prepared.roleColumn("transactions", "amount")?.name ?? null;
    const rows = drafts.map((draft) => {
      const { finding, rule } = draft;
      // A text AI judged to break the rule, or to maybe break it.
      const judgment = finding.judgment;
      const judged =
        judgment && (judgment.decision === "breaks" || judgment.decision === "unsure")
          ? { ...judgment, decision: judgment.decision }
          : null;
      const { severity, reasons } = flagSeverity({
        ruleSeverity: rule.severity,
        kind: judged ? "ai_judgment" : "rule_break",
        confidence: judged?.confidence ?? null,
        amount: finding.amount === null ? null : parseNumber(finding.amount),
        amountLimit: ruleAmountLimit(rule.preset, rule.values, amountColumn),
        repeat: repeatOf(draft),
      });
      // The routing when the run started, then the rule's own team.
      const owner =
        (finding.transactionType ? input.routing[finding.transactionType] : undefined) ??
        rule.ownerTeam ??
        null;
      const explain = (locale: "en" | "ar") =>
        judged
          ? explainJudgment(judged.field, judged.text, judged, locale)
          : explainFinding(rule.preset, finding.evidence, rule.values, locale);
      const explanationEn = explain("en");
      const explanationAr = explain("ar");
      const report = reportTo({ severity, people: draft.people, bands, matrix: settings.reportTo });
      const lineManagerId = reportToPerson("line_manager", finding.employeeId, prepared);
      const deptHeadId = reportToPerson("dept_head", finding.employeeId, prepared);
      return {
        id: draft.id,
        result_seq: finding.seq,
        kind: judged ? "ai_judgment" : "rule_break",
        confidence: judged?.confidence ?? null,
        judgment: judged
          ? {
              field: judged.field,
              text: judged.text,
              decision: judged.decision,
              pBreak: judged.pBreak,
              answers: judged.answers,
              model: judged.model,
            }
          : null,
        writing: input.writing ? "pending" : "none",
        rule_id: rule.ruleId,
        rule_version: rule.version,
        rule_title: rule.title,
        transaction_ids: finding.transactionId ? [finding.transactionId] : [],
        row_no: finding.rowNo,
        transaction_type: finding.transactionType,
        department: finding.department,
        employee_id: finding.employeeId,
        requester_id: draft.requesterId,
        transaction: draft.transaction,
        people: draft.people,
        evidence: finding.evidence,
        explanation_en: explanationEn,
        explanation_ar: explanationAr,
        suggested_fix_en: rule.suggestedActionEn,
        suggested_fix_ar: rule.suggestedActionAr,
        // A new flag's standard wording is what it first shows.
        standard_explanation_en: explanationEn,
        standard_explanation_ar: explanationAr,
        standard_fix_en: rule.suggestedActionEn,
        standard_fix_ar: rule.suggestedActionAr,
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

    for (let start = 0; start < rows.length; start += CHUNK) {
      await manager.query(
        `INSERT INTO flags (id, run_id, result_seq, kind, confidence, judgment, writing, status,
           rule_id, rule_version, rule_title,
           transaction_ids, row_no, transaction_type, department, employee_id, requester_id,
           transaction, people, evidence, explanation_en, explanation_ar, suggested_fix_en,
           suggested_fix_ar, standard_explanation_en, standard_explanation_ar, standard_fix_en,
           standard_fix_ar, severity, severity_reasons, owner_team_id, due_date, report_to,
           created_at, updated_at)
         SELECT r.id, $1, r.result_seq, r.kind, r.confidence, r.judgment, r.writing,
           'with_analyst', r.rule_id, r.rule_version,
           r.rule_title, r.transaction_ids, r.row_no, r.transaction_type, r.department,
           r.employee_id, r.requester_id, r.transaction, r.people, r.evidence, r.explanation_en,
           r.explanation_ar, r.suggested_fix_en, r.suggested_fix_ar, r.standard_explanation_en,
           r.standard_explanation_ar, r.standard_fix_en, r.standard_fix_ar, r.severity,
           r.severity_reasons, r.owner_team_id, r.due_date, r.report_to, $2, $2
         FROM jsonb_to_recordset($3::jsonb) AS r(
           id text, result_seq integer, kind text, confidence text, judgment jsonb, writing text,
           rule_id text, rule_version integer, rule_title text,
           transaction_ids text[], row_no integer, transaction_type text, department text,
           employee_id text, requester_id text, transaction jsonb, people jsonb, evidence jsonb,
           explanation_en text, explanation_ar text, suggested_fix_en text, suggested_fix_ar text,
           standard_explanation_en text, standard_explanation_ar text, standard_fix_en text,
           standard_fix_ar text,
           severity text, severity_reasons jsonb, owner_team_id uuid, due_date date, report_to jsonb
         )`,
        [input.runId, input.at, JSON.stringify(rows.slice(start, start + CHUNK))],
      );
    }
    if (seen.length > 0) {
      // A repeat isn't a decision, so the row version stays: an open decision is still valid.
      await manager.query(
        `UPDATE flags
         SET seen_again = seen_again || jsonb_build_array(jsonb_build_object('runId', $2::text, 'at', $3::text))
         WHERE id = ANY($1)`,
        [seen.map((flag) => flag.id), input.runId, input.at.toISOString()],
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
        (flag): AuditInput => ({
          actor: SYSTEM_ACTOR,
          action: "flag.seen_again",
          objectType: "flag",
          objectId: flag.id,
          after: { name: flag.id, run: input.runId },
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
