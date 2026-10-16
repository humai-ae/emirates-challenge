import { createHash } from "node:crypto";
import { amountBand, judge, normaliseText, parseNumber } from "@hrcc/engine";
import {
  type AiCheckError,
  JUDGE_BATCH_SIZE,
  JUDGMENT_QUESTION_SET,
  JudgmentAnswersSchema,
  RunTotalsSchema,
} from "@hrcc/shared";
import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { JobWithMetadata } from "pg-boss";
import { DataSource, In } from "typeorm";
import { z } from "zod";
import { AiCacheService } from "../ai/ai-cache.service.js";
import { AiClient } from "../ai/ai-client.service.js";
import { AiNotConfigured, AiRefused } from "../ai/ai-errors.js";
import { SYSTEM_ACTOR } from "../audit/actor.js";
import { AuditService } from "../audit/audit.service.js";
import { ENV, type Env } from "../config/env.js";
import {
  type ResultJudgment,
  RuleVersionEntity,
  RunEntity,
  RunResultEntity,
} from "../database/entities/index.js";
import { FlagCreationService } from "../flags/flag-creation.service.js";
import { FlagWritingService } from "../flags/flag-writing.service.js";
import { JobQueue } from "../jobs/job-queue.service.js";
import { CheckDatasetsService } from "../rules/check-datasets.service.js";
import { RUNS_LOCK_KEY } from "./run-lock.js";

export const JUDGE_QUEUE = "run.judge";

interface JudgeJob {
  runId: string;
}

/** A cached answer: Jev's four probabilities and the model that gave them. */
const CachedSchema = z.object({ answers: JudgmentAnswersSchema, model: z.string() });
type Cached = z.infer<typeof CachedSchema>;

/** A text asked about once: per rule version and text, however it is written. */
interface Group {
  key: string;
  ruleId: string;
  version: number;
  field: string;
  text: string;
  type: string | null;
  amountBand: string | null;
}

interface Tally {
  judged: number;
  flagged: number;
  couldNotCheck: number;
  passed: number;
}

/** One question per question set, rule version and text. */
export function judgmentKey(ruleId: string, version: number, text: string): string {
  return createHash("sha256")
    .update(JSON.stringify([JUDGMENT_QUESTION_SET, ruleId, version, normaliseText(text)]))
    .digest("hex");
}

/** The text AI reads: the last evidence item of a judgment result. */
function textOf(result: RunResultEntity): { field: string; text: string } {
  const last = result.evidence.at(-1);
  return { field: last?.field ?? "", text: typeof last?.value === "string" ? last.value : "" };
}

/** Groups of up to a batch, one rule version per request. */
function batches(groups: readonly Group[]): Group[][] {
  const byRule = new Map<string, Group[]>();
  for (const group of groups) {
    const rule = `${group.ruleId}@${group.version}`;
    byRule.set(rule, [...(byRule.get(rule) ?? []), group]);
  }
  return [...byRule.values()].flatMap((list) => {
    const out: Group[][] = [];
    for (let start = 0; start < list.length; start += JUDGE_BATCH_SIZE) {
      out.push(list.slice(start, start + JUDGE_BATCH_SIZE));
    }
    return out;
  });
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "unknown error");

/**
 * Decides the texts a run left for AI. Jev answers four questions about each identical text once
 * per rule version, and code applies the thresholds. The results are applied in the run lock, so
 * a run or a retry never races them. A text AI keeps failing on is left "could not check".
 */
@Injectable()
export class RunJudgingService implements OnModuleInit {
  private readonly logger = new Logger(RunJudgingService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(ENV) private readonly env: Env,
    private readonly ai: AiClient,
    private readonly cache: AiCacheService,
    private readonly jobs: JobQueue,
    private readonly audit: AuditService,
    private readonly datasets: CheckDatasetsService,
    private readonly flags: FlagCreationService,
    private readonly writer: FlagWritingService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.jobs.register<JudgeJob>(
      JUDGE_QUEUE,
      {
        retryLimit: this.env.JUDGE_RETRY_LIMIT,
        retryDelay: 2,
        retryBackoff: true,
        expireInSeconds: 900,
      },
      (job) => this.judge(job),
    );
  }

  async judge(
    job: Pick<JobWithMetadata<JudgeJob>, "data" | "retryCount" | "retryLimit">,
  ): Promise<void> {
    const { runId } = job.data;
    const waiting = await this.dataSource
      .getRepository(RunResultEntity)
      .find({ where: { runId, outcome: "needs_judgment" }, order: { seq: "ASC" } });
    if (waiting.length === 0) return;
    const ruleTexts = await this.ruleTexts(waiting);

    const groups = new Map<string, Group>();
    const groupOf = new Map<number, string>();
    for (const result of waiting) {
      const { field, text } = textOf(result);
      const key = judgmentKey(result.ruleId, result.ruleVersion, text);
      groupOf.set(result.seq, key);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          ruleId: result.ruleId,
          version: result.ruleVersion,
          field,
          text,
          type: result.transactionType,
          amountBand: amountBand(result.amount === null ? null : parseNumber(result.amount)),
        });
      }
    }

    const answers = new Map<string, Cached>();
    for (const [key, response] of await this.cache.get([...groups.keys()])) {
      const cached = CachedSchema.safeParse(response);
      if (cached.success) answers.set(key, cached.data);
    }
    const asked = [...groups.values()].filter((group) => !answers.has(group.key));
    let failure: AiCheckError | null = null;
    let model: string | null = null;
    for (const batch of batches(asked)) {
      const first = batch[0];
      if (!first) continue;
      try {
        const response = await this.ai.judge({
          rule: {
            id: first.ruleId.slice(0, 32),
            text: (ruleTexts.get(`${first.ruleId}@${first.version}`) ?? first.ruleId).slice(
              0,
              4000,
            ),
          },
          items: batch.map((group) => ({
            key: group.key,
            field: group.field.slice(0, 128),
            text: group.text.slice(0, 2000),
            type: group.type?.slice(0, 64) || null,
            amountBand: group.amountBand,
          })),
        });
        model = response.provenance.model;
        const fresh = response.answers.map(({ key, ...rest }) => ({
          key,
          value: { answers: rest, model: response.provenance.model },
        }));
        await this.cache.put(fresh.map(({ key, value }) => ({ key, response: value })));
        for (const { key, value } of fresh) answers.set(key, value);
      } catch (error) {
        if (error instanceof AiNotConfigured) {
          failure = "ai_not_set_up";
          break;
        }
        // Refused, or failing for the last time: no use asking again now.
        const final = error instanceof AiRefused || job.retryCount >= job.retryLimit;
        if (!final) throw error;
        this.logger.warn(`AI couldn't judge texts of ${runId}: ${messageOf(error)}`);
        failure = "ai_check_failed";
        break;
      }
    }

    const run = await this.dataSource.getRepository(RunEntity).findOneByOrFail({ id: runId });
    const dataset = await this.datasets.byId(run.datasetId);
    // Whether AI rewrites the texts of the flags these judgments raise.
    const writing = (await this.ai.providers())?.textModel === true;
    await this.dataSource.transaction(async (manager) => {
      // After any run that holds the lock: flags and repeats are worked out one at a time.
      await manager.query("SELECT pg_advisory_xact_lock($1)", [RUNS_LOCK_KEY]);
      const locked = await manager.findOne(RunEntity, {
        where: { id: runId },
        lock: { mode: "pessimistic_write" },
      });
      if (!locked) return;
      // Only the texts this job read, and only while they still wait: a retry may add more.
      const still = await manager.find(RunResultEntity, {
        where: { runId, outcome: "needs_judgment", seq: In(waiting.map((result) => result.seq)) },
        order: { seq: "ASC" },
      });
      if (still.length === 0) return;
      const [{ max }]: Array<{ max: number }> = await manager.query(
        "SELECT coalesce(max(finding_no), 0)::int AS max FROM run_results WHERE run_id = $1",
        [runId],
      );
      let findingNo = max;
      const perRule = new Map<string, Tally>();
      const updates: Array<
        Pick<RunResultEntity, "seq" | "outcome" | "findingNo" | "error" | "judgment">
      > = [];
      const passed: number[] = [];
      const flagged: RunResultEntity[] = [];
      let unsure = 0;
      let aiFailed = 0;
      for (const result of still) {
        const tally = perRule.get(result.ruleId) ?? {
          judged: 0,
          flagged: 0,
          couldNotCheck: 0,
          passed: 0,
        };
        perRule.set(result.ruleId, tally);
        tally.judged += 1;
        const cached = answers.get(groupOf.get(result.seq) ?? "");
        if (!cached) {
          updates.push({
            seq: result.seq,
            outcome: "could_not_check",
            findingNo: null,
            error: failure ?? "ai_check_failed",
            judgment: null,
          });
          tally.couldNotCheck += 1;
          aiFailed += 1;
          continue;
        }
        const verdict = judge(cached.answers);
        const judgment: ResultJudgment = {
          ...verdict,
          answers: cached.answers,
          model: cached.model,
          ...textOf(result),
        };
        if (verdict.decision === "does_not_break") {
          passed.push(result.seq);
          tally.passed += 1;
        } else if (verdict.decision === "could_not_check" || !dataset) {
          // Too little to judge; or the dataset is gone, so no flag could show the transaction.
          updates.push({
            seq: result.seq,
            outcome: "could_not_check",
            findingNo: null,
            error: dataset ? "ai_not_enough_information" : "ai_check_failed",
            judgment,
          });
          tally.couldNotCheck += 1;
          if (!dataset) aiFailed += 1;
        } else {
          findingNo += 1;
          updates.push({ seq: result.seq, outcome: "flagged", findingNo, error: null, judgment });
          flagged.push({ ...result, outcome: "flagged", findingNo, judgment });
          tally.flagged += 1;
          if (verdict.decision === "unsure") unsure += 1;
        }
      }
      if (updates.length > 0) {
        await manager.query(
          `UPDATE run_results AS t
           SET outcome = u.outcome, finding_no = u.finding_no, error = u.error, judgment = u.judgment
           FROM jsonb_to_recordset($2::jsonb)
             AS u(seq integer, outcome text, finding_no integer, error text, judgment jsonb)
           WHERE t.run_id = $1 AND t.seq = u.seq`,
          [
            runId,
            JSON.stringify(
              updates.map((update) => ({
                seq: update.seq,
                outcome: update.outcome,
                finding_no: update.findingNo,
                error: update.error,
                judgment: update.judgment,
              })),
            ),
          ],
        );
      }
      if (passed.length > 0) {
        await manager.query("DELETE FROM run_results WHERE run_id = $1 AND seq = ANY($2)", [
          runId,
          passed,
        ]);
      }
      const now = new Date();
      const raised =
        flagged.length > 0 && dataset
          ? await this.flags.createForRun(manager, {
              runId,
              at: now,
              dataset,
              rules: locked.rules,
              routing: locked.routing,
              results: flagged,
              writing,
            })
          : { newFlags: 0, seenAgain: 0, created: [] };
      if (writing) await this.writer.queue(manager, raised.created);
      const totals = RunTotalsSchema.parse(locked.totals);
      const sum = (pick: (tally: Tally) => number) =>
        [...perRule.values()].reduce((total, tally) => total + pick(tally), 0);
      await manager.update(
        RunEntity,
        { id: runId },
        {
          rules: locked.rules.map((rule) => {
            const tally = perRule.get(rule.ruleId);
            if (!tally) return rule;
            return {
              ...rule,
              counts: {
                ...rule.counts,
                needs_judgment: Math.max(0, rule.counts.needs_judgment - tally.judged),
                flagged: rule.counts.flagged + tally.flagged,
                could_not_check: rule.counts.could_not_check + tally.couldNotCheck,
                passed: rule.counts.passed + tally.passed,
              },
            };
          }),
          totals: {
            ...totals,
            findings: totals.findings + sum((tally) => tally.flagged),
            couldNotCheck: totals.couldNotCheck + sum((tally) => tally.couldNotCheck),
            waitingForAi: Math.max(0, totals.waitingForAi - sum((tally) => tally.judged)),
            aiFailed: totals.aiFailed + aiFailed,
            newFlags: totals.newFlags + raised.newFlags,
            seenAgain: totals.seenAgain + raised.seenAgain,
          },
        },
      );
      await this.audit.append(
        manager,
        {
          actor: SYSTEM_ACTOR,
          action: "run.ai_checks",
          objectType: "run",
          objectId: runId,
          after: {
            name: runId,
            judged: still.length,
            flagged: flagged.length,
            unsure,
            passed: passed.length,
            couldNotCheck: sum((tally) => tally.couldNotCheck),
            newFlags: raised.newFlags,
            seenAgain: raised.seenAgain,
          },
          ai: {
            provider: "typesafe",
            model: model ?? [...answers.values()][0]?.model ?? "none",
            promptVersion: JUDGMENT_QUESTION_SET,
            inputRef: createHash("sha256")
              .update(JSON.stringify([...groups.keys()].sort()))
              .digest("hex"),
            output: {
              texts: groups.size,
              asked: asked.length,
              fromCache: groups.size - asked.length,
              failure,
            },
          },
        },
        now,
      );
    });
  }

  /** Each rule version's text as the policy wrote it, by "R-07@1". */
  private async ruleTexts(results: readonly RunResultEntity[]): Promise<Map<string, string>> {
    const ids = [...new Set(results.map((result) => result.ruleId))];
    const versions = await this.dataSource
      .getRepository(RuleVersionEntity)
      .findBy({ ruleId: In(ids) });
    return new Map(versions.map((row) => [`${row.ruleId}@${row.version}`, row.sourceText]));
  }
}
