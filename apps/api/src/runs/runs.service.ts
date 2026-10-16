import { InvalidCheckError, type RuleRun, runChecks } from "@hrcc/engine";
import type {
  Check,
  CheckOutcome,
  PresetId,
  RunResponse,
  RunsListResponse,
  RunTotals,
  User,
} from "@hrcc/shared";
import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, type EntityManager, In } from "typeorm";
import { actorOf } from "../audit/actor.js";
import { AuditService } from "../audit/audit.service.js";
import { toTeamSummary } from "../auth/users.service.js";
import { ApiException } from "../common/api-exception.js";
import {
  RuleEntity,
  RuleVersionEntity,
  RunEntity,
  type RunResultEntity,
  type RunRuleSnapshot,
} from "../database/entities/index.js";
import { CheckDatasetsService, type LoadedDataset } from "../rules/check-datasets.service.js";
import { valuesOf } from "../rules/drafting.js";
import { toRunDetail, toRunSummary } from "./run-dto.js";

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
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      };
      await manager.insert(RunEntity, {
        id: runId,
        datasetId: dataset.id,
        status: rules.some((rule) => rule.error) ? "complete_with_errors" : "complete",
        rules,
        totals,
        startedById: user.id,
        startedAt,
        finishedAt,
      });
      await insertResults(manager, runId, results);
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
    return { run: toRunDetail(run), workedExamples: null, exportReady: false };
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
