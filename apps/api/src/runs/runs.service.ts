import {
  checkWorkedExamples,
  explainFinding,
  type FindingRow,
  flaggedKey,
  InvalidCheckError,
  type RuleRun,
  renderFindingsCsv,
  runChecks,
} from "@hrcc/engine";
import {
  type Check,
  type CheckOutcome,
  DEFAULT_FINDING_VALUES,
  type PresetId,
  type RunResponse,
  type RunResultsQuery,
  type RunResultsResponse,
  type RunsListResponse,
  type RunTotals,
  type User,
  type WorkedExample,
} from "@hrcc/shared";
import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, type EntityManager, type FindOptionsWhere, In, MoreThan } from "typeorm";
import { actorOf } from "../audit/actor.js";
import { AuditService } from "../audit/audit.service.js";
import { toTeamSummary } from "../auth/users.service.js";
import { ApiException } from "../common/api-exception.js";
import {
  type FindingFormatEntity,
  RoutingRuleEntity,
  RuleEntity,
  RuleVersionEntity,
  RunEntity,
  RunResultEntity,
  type RunRuleSnapshot,
} from "../database/entities/index.js";
import { FlagCreationService } from "../flags/flag-creation.service.js";
import { CheckDatasetsService, type LoadedDataset } from "../rules/check-datasets.service.js";
import { valuesOf } from "../rules/drafting.js";
import { FindingFormatsService } from "./finding-formats.service.js";
import { toRunDetail, toRunResult, toRunSummary } from "./run-dto.js";

/** One run at a time (pg_advisory_xact_lock key). */
export const RUNS_LOCK_KEY = 482_047;
const DUBAI_OFFSET_MS = 4 * 3_600_000;
/** Results per INSERT; each statement sends its rows as one jsonb parameter. */
const CHUNK = 2_000;

const NO_COUNTS: Readonly<Record<CheckOutcome, number>> = {
  not_applicable: 0,
  passed: 0,
  flagged: 0,
  could_not_check: 0,
  needs_judgment: 0,
};

type NewResult = Omit<RunResultEntity, "runId">;

/** What each result keeps of its transaction. */
interface RowFacts {
  type: string | null;
  employeeId: string | null;
  department: string | null;
  effectiveDate: string | null;
  amount: string | null;
}

/** "RUN-2026-10-16-03": the Dubai date and that day's number. */
async function nextRunId(manager: EntityManager, at: Date): Promise<string> {
  const day = new Date(at.getTime() + DUBAI_OFFSET_MS).toISOString().slice(0, 10);
  const [{ count }]: Array<{ count: number }> = await manager.query(
    "SELECT count(*)::int AS count FROM runs WHERE id LIKE $1",
    [`RUN-${day}-%`],
  );
  return `RUN-${day}-${String(count + 1).padStart(2, "0")}`;
}

/** The employee, type, department, effective date and amount of each transaction. */
async function rowFacts(
  manager: EntityManager,
  dataset: LoadedDataset,
): Promise<Map<number, RowFacts>> {
  const stored: Array<{
    row_no: number;
    type: string | null;
    employee_id: string | null;
    effective_date: string | null;
  }> = await manager.query(
    "SELECT row_no, type, employee_id, effective_date::text AS effective_date FROM transactions WHERE dataset_id = $1",
    [dataset.id],
  );
  const department = dataset.prepared.roleColumn("transactions", "department")?.name;
  const amount = dataset.prepared.roleColumn("transactions", "amount")?.name;
  const cell = (rowNo: number, column: string | undefined): string | null => {
    const value = column ? dataset.prepared.rows[rowNo - 1]?.cells[column]?.trim() : undefined;
    return value ? value : null;
  };
  return new Map(
    stored.map((row) => [
      row.row_no,
      {
        type: row.type,
        employeeId: row.employee_id,
        department: cell(row.row_no, department),
        effectiveDate: row.effective_date,
        amount: cell(row.row_no, amount),
      },
    ]),
  );
}

async function insertResults(
  manager: EntityManager,
  runId: string,
  results: readonly NewResult[],
): Promise<void> {
  for (let start = 0; start < results.length; start += CHUNK) {
    const records = results.slice(start, start + CHUNK).map((result) => ({
      seq: result.seq,
      rule_id: result.ruleId,
      rule_version: result.ruleVersion,
      row_no: result.rowNo,
      transaction_id: result.transactionId,
      employee_id: result.employeeId,
      transaction_type: result.transactionType,
      department: result.department,
      effective_date: result.effectiveDate,
      amount: result.amount,
      outcome: result.outcome,
      finding_no: result.findingNo,
      evidence: result.evidence,
      missing: result.missing,
      error: result.error,
    }));
    await manager.query(
      `INSERT INTO run_results (run_id, seq, rule_id, rule_version, row_no, transaction_id, employee_id,
         transaction_type, department, effective_date, amount, outcome, finding_no, evidence, missing, error)
       SELECT $1, r.seq, r.rule_id, r.rule_version, r.row_no, r.transaction_id, r.employee_id,
         r.transaction_type, r.department, r.effective_date, r.amount, r.outcome, r.finding_no,
         r.evidence, r.missing, r.error
       FROM jsonb_to_recordset($2::jsonb) AS r(
         seq integer, rule_id text, rule_version integer, row_no integer, transaction_id text,
         employee_id text, transaction_type text, department text, effective_date date, amount text,
         outcome text, finding_no integer, evidence jsonb, missing jsonb, error text
       )`,
      [runId, JSON.stringify(records)],
    );
  }
}

@Injectable()
export class RunsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly datasets: CheckDatasetsService,
    private readonly audit: AuditService,
    private readonly formats: FindingFormatsService,
    private readonly flags: FlagCreationService,
  ) {}

  /**
   * Checks every transaction of the newest ready dataset against every live rule version and keeps
   * the findings and the transactions that couldn't be checked. A rule whose check can't run on
   * this dataset is reported, and the others still run.
   */
  async start(user: User): Promise<RunResponse> {
    const dataset = await this.datasets.latest();
    if (!dataset) throw new ApiException(409, "no_dataset");
    const live = await this.liveRules();
    if (live.length === 0) throw new ApiException(409, "no_live_rules");
    const id = await this.dataSource.transaction(async (manager) => {
      // Held for the whole run, so a second start gets an answer straight away.
      const [{ locked }]: Array<{ locked: boolean }> = await manager.query(
        "SELECT pg_try_advisory_xact_lock($1) AS locked",
        [RUNS_LOCK_KEY],
      );
      if (!locked) throw new ApiException(409, "run_in_progress");
      const startedAt = new Date();
      const facts = await rowFacts(manager, dataset);
      const routing = Object.fromEntries(
        (await manager.find(RoutingRuleEntity, { relations: { team: true } })).map((row) => [
          row.transactionType,
          toTeamSummary(row.team),
        ]),
      );
      const rules: RunRuleSnapshot[] = [];
      const results: NewResult[] = [];
      let findings = 0;
      for (const { version, title } of live) {
        let run: RuleRun | undefined;
        let error: string | null = null;
        try {
          [run] = runChecks(dataset.prepared, [
            { ruleId: version.ruleId, version: version.version, check: version.check as Check },
          ]);
        } catch (caught) {
          if (!(caught instanceof InvalidCheckError)) throw caught;
          error = caught.message;
        }
        rules.push({
          ruleId: version.ruleId,
          version: version.version,
          title,
          preset: version.preset as PresetId,
          values: valuesOf(version.parameters),
          severity: version.severity,
          ownerTeam: version.ownerTeam ? toTeamSummary(version.ownerTeam) : null,
          suggestedActionEn: version.suggestedActionEn,
          suggestedActionAr: version.suggestedActionAr,
          counts: run?.counts ?? { ...NO_COUNTS },
          error,
        });
        for (const result of run?.results ?? []) {
          if (result.outcome !== "flagged" && result.outcome !== "could_not_check") continue;
          const row = facts.get(result.rowNo);
          results.push({
            seq: results.length + 1,
            ruleId: version.ruleId,
            ruleVersion: version.version,
            rowNo: result.rowNo,
            transactionId: result.transactionId,
            employeeId: row?.employeeId ?? null,
            transactionType: row?.type ?? null,
            department: row?.department ?? null,
            effectiveDate: row?.effectiveDate ?? null,
            amount: row?.amount ?? null,
            outcome: result.outcome,
            findingNo: result.outcome === "flagged" ? ++findings : null,
            evidence: result.evidence,
            missing: result.missing,
            error: result.error,
            judgment: null,
          });
        }
      }
      const runId = await nextRunId(manager, startedAt);
      const finishedAt = new Date();
      const totals: RunTotals = {
        transactions: dataset.prepared.rows.length,
        findings,
        couldNotCheck: results.length - findings,
        waitingForAi: rules.reduce((sum, rule) => sum + rule.counts.needs_judgment, 0),
        newFlags: 0,
        seenAgain: 0,
        aiFailed: 0,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      };
      await manager.insert(RunEntity, {
        id: runId,
        datasetId: dataset.id,
        status: rules.some((rule) => rule.error) ? "complete_with_errors" : "complete",
        rules,
        routing,
        totals,
        startedById: user.id,
        startedAt,
        finishedAt,
      });
      await insertResults(manager, runId, results);
      const flags = await this.flags.createForRun(manager, {
        runId,
        at: finishedAt,
        dataset,
        rules,
        routing,
        results,
      });
      await manager.update(RunEntity, { id: runId }, { totals: { ...totals, ...flags } });
      await this.audit.append(manager, {
        actor: actorOf(user),
        action: "run.start",
        objectType: "run",
        objectId: runId,
        after: {
          name: runId,
          dataset: dataset.info.name,
          rules: rules.length,
          findings,
          couldNotCheck: totals.couldNotCheck,
          newFlags: flags.newFlags,
          seenAgain: flags.seenAgain,
        },
      });
      return runId;
    });
    return this.detail(id);
  }

  async list(): Promise<RunsListResponse> {
    const runs = await this.dataSource.getRepository(RunEntity).find({
      relations: { dataset: true, startedBy: true },
      order: { startedAt: "DESC", id: "DESC" },
    });
    return { runs: runs.map(toRunSummary) };
  }

  async detail(id: string): Promise<RunResponse> {
    const run = await this.find(id);
    const format = await this.formats.confirmed();
    return {
      run: toRunDetail(run),
      workedExamples: format ? await this.workedExamples(run, format) : null,
      exportReady: format !== null,
    };
  }

  async results(id: string, query: RunResultsQuery): Promise<RunResultsResponse> {
    const run = await this.find(id);
    const where: FindOptionsWhere<RunResultEntity> = { runId: id, outcome: query.outcome };
    if (query.ruleId) where.ruleId = query.ruleId;
    if (query.after !== undefined) where.seq = MoreThan(query.after);
    const rows = await this.dataSource
      .getRepository(RunResultEntity)
      .find({ where, order: { seq: "ASC" }, take: query.limit + 1 });
    const shown = rows.slice(0, query.limit);
    const rules = new Map(run.rules.map((rule) => [rule.ruleId, rule]));
    const values = (await this.formats.confirmed())?.values ?? DEFAULT_FINDING_VALUES;
    return {
      results: shown.map((row) => toRunResult(row, rules.get(row.ruleId), values)),
      nextAfter: rows.length > query.limit ? (shown.at(-1)?.seq ?? null) : null,
    };
  }

  /** The run's findings in the confirmed format, as CSV; every download is audited. */
  async export(id: string, user: User): Promise<{ filename: string; csv: string }> {
    const run = await this.find(id);
    const format = await this.formats.confirmed();
    if (!format) throw new ApiException(409, "no_finding_format");
    const results = await this.dataSource
      .getRepository(RunResultEntity)
      .find({ where: { runId: id, outcome: "flagged" }, order: { seq: "ASC" } });
    const rules = new Map(run.rules.map((rule) => [rule.ruleId, rule]));
    const rows = results.flatMap((result): FindingRow[] => {
      const rule = rules.get(result.ruleId);
      if (!rule || result.findingNo === null) return [];
      return [
        {
          findingNo: result.findingNo,
          transactionId: result.transactionId,
          ruleId: rule.ruleId,
          ruleTitle: rule.title,
          severity: rule.severity,
          description: explainFinding(rule.preset, result.evidence, rule.values, "en"),
          evidence: result.evidence,
          // The owner team of the transaction's type when the run started, else the rule's team.
          owner:
            (result.transactionType ? run.routing[result.transactionType] : undefined)?.nameEn ??
            rule.ownerTeam?.nameEn ??
            "",
          recommendedAction: rule.suggestedActionEn,
          employeeId: result.employeeId,
          transactionType: result.transactionType,
          department: result.department,
          effectiveDate: result.effectiveDate,
          amount: result.amount,
          runId: id,
        },
      ];
    });
    const csv = renderFindingsCsv(format.columns, format.mapping, format.values, rows);
    await this.dataSource.transaction((manager) =>
      this.audit.append(manager, {
        actor: actorOf(user),
        action: "run.export",
        objectType: "run",
        objectId: id,
        after: { name: id, findings: rows.length, format: format.filename },
      }),
    );
    return { filename: `${id}-findings.csv`, csv };
  }

  /** Whether this run found each worked example of the format, and if not, why not. */
  private async workedExamples(
    run: RunEntity,
    format: FindingFormatEntity,
  ): Promise<WorkedExample[]> {
    const column = format.mapping.indexOf("transaction_id");
    const ids = [
      ...new Set(format.examples.map((example) => (example[column] ?? "").trim())),
    ].filter(Boolean);
    const deleted = run.dataset.status === "deleted";
    const known: Array<{ transaction_id: string }> =
      ids.length && !deleted
        ? await this.dataSource.query(
            "SELECT DISTINCT transaction_id FROM transactions WHERE dataset_id = $1 AND transaction_id = ANY($2)",
            [run.datasetId, ids],
          )
        : [];
    const flagged: Array<{ transaction_id: string; rule_id: string }> = ids.length
      ? await this.dataSource.query(
          "SELECT transaction_id, rule_id FROM run_results WHERE run_id = $1 AND outcome = 'flagged' AND transaction_id = ANY($2)",
          [run.id, ids],
        )
      : [];
    return checkWorkedExamples(format.examples, format.mapping, {
      ruleIds: run.rules.filter((rule) => !rule.error).map((rule) => rule.ruleId),
      flagged: new Set(flagged.map((row) => flaggedKey(row.transaction_id, row.rule_id))),
      transactionIds: deleted ? null : new Set(known.map((row) => row.transaction_id)),
    });
  }

  private async find(id: string): Promise<RunEntity> {
    const run = await this.dataSource
      .getRepository(RunEntity)
      .findOne({ where: { id }, relations: { dataset: true, startedBy: true } });
    if (!run) throw new ApiException(404, "not_found");
    return run;
  }

  /** Every live rule version with its rule's title, in rule ID order. */
  private async liveRules(): Promise<Array<{ version: RuleVersionEntity; title: string }>> {
    const versions = await this.dataSource
      .getRepository(RuleVersionEntity)
      .find({ where: { status: "active" }, relations: { ownerTeam: true } });
    if (versions.length === 0) return [];
    const rules = await this.dataSource
      .getRepository(RuleEntity)
      .findBy({ id: In(versions.map((version) => version.ruleId)) });
    const titles = new Map(rules.map((rule) => [rule.id, rule.title]));
    return versions
      .sort((a, b) => a.ruleId.localeCompare(b.ruleId, "en", { numeric: true }))
      .map((version) => ({ version, title: titles.get(version.ruleId) ?? version.ruleId }));
  }
}
