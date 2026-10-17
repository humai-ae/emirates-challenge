import {
  disagreement,
  evaluateRow,
  InvalidCheckError,
  type PreparedCheck,
  type PreparedDataset,
  personIdsIn,
  prepareCheck,
  pseudonymsFor,
  secondOpinionInput,
} from "@hrcc/engine";
import {
  type OpinionCode,
  RunTotalsSchema,
  SECOND_OPINION_BATCH,
  SECOND_OPINION_SLICE,
  type SecondOpinionState,
} from "@hrcc/shared";
import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { JobWithMetadata } from "pg-boss";
import type { DataSource, EntityManager } from "typeorm";
import { AiClient } from "../ai/ai-client.service.js";
import { AiNotConfigured, AiRefused } from "../ai/ai-errors.js";
import { SYSTEM_ACTOR } from "../audit/actor.js";
import { AuditService } from "../audit/audit.service.js";
import { ENV, type Env } from "../config/env.js";
import { RuleVersionEntity, RunEntity, type RunRuleSnapshot } from "../database/entities/index.js";
import { JobQueue } from "../jobs/job-queue.service.js";
import { CheckDatasetsService } from "../rules/check-datasets.service.js";
import { RUNS_LOCK_KEY } from "./run-lock.js";

export const SECOND_OPINION_QUEUE = "run.second_opinion";
/** Where pg-boss puts a slice it gave up on, such as one whose worker died on its last try. */
export const SECOND_OPINION_GIVEN_UP_QUEUE = "run.second_opinion.given_up";

/** One slice of a run's transactions, by row number, both ends included. */
interface OpinionsJob {
  runId: string;
  first: number;
  last: number;
}

/** A rule's check ready to read rows, and its policy text for Jev. */
interface RuleCheck {
  ruleId: string;
  version: number;
  text: string;
  prepared: PreparedCheck;
}

/** A strong disagreement, as it is kept. */
interface Kept {
  rule_id: string;
  rule_version: number;
  row_no: number;
  transaction_id: string | null;
  code: OpinionCode;
  p_break: number;
  p_enough: number;
  strength: number;
}

/** Rules a Jev request may name at once. */
const RULES_PER_REQUEST = 20;
const messageOf = (error: unknown) => (error instanceof Error ? error.message : "unknown error");

/** The audit event of a second opinion that ended. */
function completed(
  runId: string,
  transactions: number,
  disagreements: number,
  state: SecondOpinionState,
) {
  return {
    actor: SYSTEM_ACTOR,
    action: "run.second_opinion_complete" as const,
    objectType: "run",
    objectId: runId,
    after: { name: runId, transactions, disagreements, state },
  };
}

/** The slices to queue for a run: row numbers in runs of at most a slice. */
export function opinionSlices(rows: number, runId: string): OpinionsJob[] {
  const slices: OpinionsJob[] = [];
  for (let first = 1; first <= rows; first += SECOND_OPINION_SLICE) {
    slices.push({ runId, first, last: Math.min(rows, first + SECOND_OPINION_SLICE - 1) });
  }
  return slices;
}

/** Every ID in the employees file: a field that names one of them names a person. */
function staffOf(prepared: PreparedDataset): Set<string> {
  const column = prepared.roleColumn("employees", "employee_id");
  if (!column) return new Set();
  return new Set(prepared.employees().map((cells) => (cells[column.name] ?? "").trim()));
}

/** The people a transaction names: its employee, requester and approvers. */
function peopleOf(prepared: PreparedDataset, index: number): string[] {
  const cell = (role: string) => {
    const column = prepared.roleColumn("transactions", role);
    return column ? (prepared.rows[index]?.cells[column.name] ?? "").trim() : "";
  };
  return [
    cell("employee_id"),
    cell("requester_id"),
    ...prepared.approverIds(index).map((item) => item.id),
  ].filter((id) => id !== "");
}

/**
 * Asks Jev for a second opinion on a run's transactions, a slice at a time, in the background.
 * Each row's structured rules that applied are checked again here, Jev reads what those rules
 * name (people as tokens), and only strong disagreements are kept. Never findings.
 */
@Injectable()
export class RunSecondOpinionsService implements OnModuleInit {
  private readonly logger = new Logger(RunSecondOpinionsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(ENV) private readonly env: Env,
    private readonly ai: AiClient,
    private readonly jobs: JobQueue,
    private readonly audit: AuditService,
    private readonly datasets: CheckDatasetsService,
  ) {}

  async onModuleInit(): Promise<void> {
    // The dead letters' queue first: the slices' queue names it.
    await this.jobs.register<OpinionsJob>(
      SECOND_OPINION_GIVEN_UP_QUEUE,
      { retryLimit: 5, retryDelay: 5, retryBackoff: true, expireInSeconds: 300 },
      (job) => this.givenUp(job),
    );
    await this.jobs.register<OpinionsJob>(
      SECOND_OPINION_QUEUE,
      {
        retryLimit: this.env.SECOND_OPINION_RETRY_LIMIT,
        retryDelay: 2,
        retryBackoff: true,
        expireInSeconds: 900,
        deadLetter: SECOND_OPINION_GIVEN_UP_QUEUE,
      },
      (job) => this.ask(job),
    );
    if (!this.jobs.enabled) await this.endStranded();
  }

  async ask(
    job: Pick<JobWithMetadata<OpinionsJob>, "data" | "retryCount" | "retryLimit">,
  ): Promise<void> {
    const { runId, first, last } = job.data;
    try {
      await this.read(job.data);
    } catch (error) {
      // Not set up, refused, or failing for the last time, whatever failed: the slice is counted
      // as failed, so the second opinion still ends.
      const final =
        error instanceof AiNotConfigured ||
        error instanceof AiRefused ||
        job.retryCount >= job.retryLimit;
      if (!final) throw error;
      this.logger.warn(
        `No second opinions on rows ${first}-${last} of ${runId}: ${messageOf(error)}`,
      );
      await this.dataSource.transaction((manager) =>
        this.count(manager, runId, first, last - first + 1, [], true),
      );
    }
  }

  /** A slice pg-boss gave up on: counted as failed, so the second opinion still ends. */
  async givenUp(job: Pick<JobWithMetadata<OpinionsJob>, "data">): Promise<void> {
    const { runId, first, last } = job.data;
    this.logger.warn(`Gave up second opinions on rows ${first}-${last} of ${runId}`);
    await this.dataSource.transaction((manager) =>
      this.count(manager, runId, first, last - first + 1, [], true),
    );
  }

  /** Jev's second opinion on a slice's rows, counted once. */
  private async read({ runId, first, last }: OpinionsJob): Promise<void> {
    const run = await this.dataSource.getRepository(RunEntity).findOneBy({ id: runId });
    if (!run || RunTotalsSchema.parse(run.totals).secondOpinionState !== "running") return;
    const counted: unknown[] = await this.dataSource.query(
      "SELECT 1 FROM second_opinion_slices WHERE run_id = $1 AND first_row = $2",
      [runId, first],
    );
    if (counted.length > 0) return;
    const dataset = await this.datasets.byId(run.datasetId);
    const kept = dataset
      ? await this.opinions(
          dataset.prepared,
          await this.checks(run.rules, dataset.prepared),
          first,
          last,
        )
      : [];
    await this.dataSource.transaction((manager) =>
      this.count(manager, runId, first, last - first + 1, kept, dataset === null),
    );
  }

  /**
   * Without background jobs, a second opinion still running will never read the rest: it ends as
   * failed when the app starts.
   */
  private async endStranded(): Promise<void> {
    const stranded: Array<{ id: string }> = await this.dataSource.query(
      "SELECT id FROM runs WHERE totals ->> 'secondOpinionState' = 'running'",
    );
    for (const { id } of stranded) {
      await this.dataSource.transaction(async (manager) => {
        await manager.query("SELECT pg_advisory_xact_lock($1)", [RUNS_LOCK_KEY]);
        const locked = await manager.findOne(RunEntity, {
          where: { id },
          lock: { mode: "pessimistic_write" },
        });
        if (!locked) return;
        const totals = RunTotalsSchema.parse(locked.totals);
        if (totals.secondOpinionState !== "running") return;
        const now = new Date();
        await manager.update(
          RunEntity,
          { id },
          { totals: { ...totals, secondOpinionState: "failed" } },
        );
        await this.audit.append(
          manager,
          completed(id, totals.secondOpinionDone, totals.disagreements, "failed"),
          now,
        );
      });
    }
  }

  /** Counts a slice once, in the run lock; the last slice to finish ends the second opinion. */
  private async count(
    manager: EntityManager,
    runId: string,
    first: number,
    rows: number,
    kept: readonly Kept[],
    failed: boolean,
  ): Promise<void> {
    await manager.query("SELECT pg_advisory_xact_lock($1)", [RUNS_LOCK_KEY]);
    const locked = await manager.findOne(RunEntity, {
      where: { id: runId },
      lock: { mode: "pessimistic_write" },
    });
    if (!locked) return;
    const totals = RunTotalsSchema.parse(locked.totals);
    if (totals.secondOpinionState !== "running") return;
    const slice: unknown[] = await manager.query(
      `INSERT INTO second_opinion_slices (run_id, first_row, failed) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING RETURNING first_row`,
      [runId, first, failed],
    );
    // A retry or a second delivery of a slice already counted.
    if (slice.length === 0) return;
    const now = new Date();
    const added: unknown[] =
      kept.length > 0
        ? await manager.query(
            `INSERT INTO second_opinions (run_id, rule_id, rule_version, row_no, transaction_id,
               code, p_break, p_enough, strength, created_at)
             SELECT $1, r.rule_id, r.rule_version, r.row_no, r.transaction_id, r.code, r.p_break,
               r.p_enough, r.strength, $2
             FROM jsonb_to_recordset($3::jsonb) AS r(rule_id text, rule_version integer,
               row_no integer, transaction_id text, code text, p_break double precision,
               p_enough double precision, strength double precision)
             ON CONFLICT (run_id, rule_id, row_no) DO NOTHING
             RETURNING id`,
            [runId, now, JSON.stringify(kept)],
          )
        : [];
    const done = totals.secondOpinionDone + rows;
    const disagreements = totals.disagreements + added.length;
    const finished = done >= totals.secondOpinionTotal;
    let state: SecondOpinionState = totals.secondOpinionState;
    if (finished) {
      const [{ any }]: Array<{ any: boolean | null }> = await manager.query(
        "SELECT bool_or(failed) AS any FROM second_opinion_slices WHERE run_id = $1",
        [runId],
      );
      state = any ? "failed" : "done";
    }
    await manager.update(
      RunEntity,
      { id: runId },
      {
        totals: { ...totals, secondOpinionDone: done, disagreements, secondOpinionState: state },
      },
    );
    if (finished)
      await this.audit.append(manager, completed(runId, done, disagreements, state), now);
  }

  /** The run's structured rule versions, each check prepared for this dataset. */
  private async checks(
    rules: readonly RunRuleSnapshot[],
    prepared: PreparedDataset,
  ): Promise<RuleCheck[]> {
    const structured = rules.filter((rule) => rule.preset !== "text_judgment");
    if (structured.length === 0) return [];
    const versions = await this.dataSource.getRepository(RuleVersionEntity).find({
      where: structured.map((rule) => ({ ruleId: rule.ruleId, version: rule.version })),
    });
    return structured.flatMap((rule) => {
      const version = versions.find(
        (row) => row.ruleId === rule.ruleId && row.version === rule.version,
      );
      if (!version?.check) return [];
      try {
        return [
          {
            ruleId: rule.ruleId,
            version: rule.version,
            text: version.sourceText || rule.title,
            prepared: prepareCheck(version.check, prepared),
          },
        ];
      } catch (error) {
        // A check the dataset can't run: the run reported it; no opinion on it.
        if (error instanceof InvalidCheckError) return [];
        throw error;
      }
    });
  }

  /** Jev's second opinion on the slice's rows, ten at a time; the strong disagreements. */
  private async opinions(
    prepared: PreparedDataset,
    checks: readonly RuleCheck[],
    first: number,
    last: number,
  ): Promise<Kept[]> {
    const pending: Array<{ index: number; rules: Array<{ check: RuleCheck; code: OpinionCode }> }> =
      [];
    for (let rowNo = first; rowNo <= last; rowNo += 1) {
      const index = rowNo - 1;
      if (!prepared.rows[index]) continue;
      const rules = checks.flatMap((check) => {
        const { outcome } = evaluateRow(prepared, check.prepared, index);
        return outcome === "flagged" || outcome === "passed" ? [{ check, code: outcome }] : [];
      });
      if (rules.length > 0) pending.push({ index, rules });
    }
    const kept: Kept[] = [];
    const staff = staffOf(prepared);
    for (let start = 0; start < pending.length; start += SECOND_OPINION_BATCH) {
      const batch = pending.slice(start, start + SECOND_OPINION_BATCH);
      const ruleIds = [...new Set(batch.flatMap((item) => item.rules.map((r) => r.check.ruleId)))];
      for (let from = 0; from < ruleIds.length; from += RULES_PER_REQUEST) {
        const names = ruleIds.slice(from, from + RULES_PER_REQUEST);
        const place = new Map(names.map((id, at) => [id, at]));
        const items = batch
          .map((item) => ({ item, rules: item.rules.filter((r) => place.has(r.check.ruleId)) }))
          .filter(({ rules }) => rules.length > 0)
          .map(({ item, rules }) => ({
            item,
            rules,
            input: secondOpinionInput(
              prepared,
              rules.map((r) => r.check.prepared),
              item.index,
            ),
          }));
        // Everyone the fields name becomes a token: the people involved, and anyone else, such as
        // a reporting line or a person a text mentions.
        const known = items.flatMap(({ item }) => peopleOf(prepared, item.index));
        const others = personIdsIn(
          items.flatMap(({ input }) => input.fields.flatMap((field) => field.value)),
          known,
          staff,
          [
            ...items.flatMap(({ item }) => prepared.rows[item.index]?.transactionId ?? []),
            ...names,
          ],
        );
        const people = pseudonymsFor([...known, ...others]);
        const hide = (value: string | string[]) =>
          Array.isArray(value) ? value.map((part) => people.hide(part)) : people.hide(value);
        const response = await this.ai.secondOpinion({
          rules: names.map((id) => ({
            id,
            text: (checks.find((check) => check.ruleId === id)?.text ?? id).slice(0, 4000),
          })),
          transactions: items.map(({ item, rules, input }) => ({
            key: `r${item.index}`,
            rules: rules.map((r) => place.get(r.check.ruleId) ?? 0),
            fields: input.fields.map((field) => ({ name: field.name, value: hide(field.value) })),
            gaps: input.gaps,
          })),
        });
        const enough = new Map(response.enough.map((answer) => [answer.key, answer.p]));
        for (const answer of response.answers) {
          const found = items.find(({ item }) => `r${item.index}` === answer.key);
          const rule = found?.rules.find((r) => r.check.ruleId === answer.rule);
          if (!found || !rule) continue;
          const enoughHere = enough.get(answer.key) ?? 0;
          const strong = disagreement(rule.code, answer.pBreak, enoughHere);
          if (!strong) continue;
          kept.push({
            rule_id: rule.check.ruleId,
            rule_version: rule.check.version,
            row_no: found.item.index + 1,
            transaction_id: prepared.rows[found.item.index]?.transactionId ?? null,
            code: rule.code,
            p_break: answer.pBreak,
            p_enough: enoughHere,
            strength: strong.strength,
          });
        }
      }
    }
    return kept;
  }
}
