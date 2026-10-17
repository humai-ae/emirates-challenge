import { createHash } from "node:crypto";
import {
  findPatterns,
  limitsOf,
  type PatternCandidate,
  type PreparedDataset,
  patternDescription,
  patternKey,
  preselect,
  pseudonymsFor,
  type RankedPattern,
  rankPatterns,
} from "@hrcc/engine";
import { PATTERN_QUESTION_SET, PATTERN_RANK_BATCH, RunTotalsSchema } from "@hrcc/shared";
import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { JobWithMetadata } from "pg-boss";
import type { DataSource, EntityManager } from "typeorm";
import { AiClient } from "../ai/ai-client.service.js";
import { AiNotConfigured, AiRefused } from "../ai/ai-errors.js";
import { SYSTEM_ACTOR } from "../audit/actor.js";
import { AuditService } from "../audit/audit.service.js";
import { ENV, type Env } from "../config/env.js";
import { RunEntity, type RunRuleSnapshot } from "../database/entities/index.js";
import type { RunFlagsCount } from "../flags/flag-creation.service.js";
import { FlagWritingService } from "../flags/flag-writing.service.js";
import { PatternFlagsService } from "../flags/pattern-flags.service.js";
import { JobQueue } from "../jobs/job-queue.service.js";
import { CheckDatasetsService, type LoadedDataset } from "../rules/check-datasets.service.js";
import { RUNS_LOCK_KEY } from "./run-lock.js";

export const PATTERNS_QUEUE = "run.patterns";

interface PatternsJob {
  runId: string;
}

/** Facts whose value is a person's ID: AI reads a token instead. */
const PERSON_FACTS: ReadonlySet<string> = new Set(["requester", "approver", "employee"]);
/** Facts that name a single transaction: not an aggregate fact, so AI doesn't read them. */
const ROW_FACTS: ReadonlySet<string> = new Set(["transaction"]);
/** Check types about repeats in time: a group one of them flagged is its finding, not a split. */
const HISTORY_PRESETS: ReadonlySet<string> = new Set([
  "duplicate_transaction",
  "max_count_in_window",
]);

/**
 * The rows a run's rules flagged, 0-based: every rule's, and those of the rules about repeats in
 * time, from the run's results and its rule snapshot.
 */
export function rowsFlagged(
  results: ReadonlyArray<{ ruleId: string; rowNo: number }>,
  rules: readonly RunRuleSnapshot[],
): { flaggedRows: Set<number>; duplicateRows: Set<number> } {
  const history = new Set(
    rules.filter((rule) => HISTORY_PRESETS.has(rule.preset)).map((rule) => rule.ruleId),
  );
  return {
    flaggedRows: new Set(results.map((result) => result.rowNo - 1)),
    duplicateRows: new Set(
      results.filter((result) => history.has(result.ruleId)).map((result) => result.rowNo - 1),
    ),
  };
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "unknown error");

/** The amount limits of a run's rule versions, in the dataset's amount column. */
export function runLimits(rules: readonly RunRuleSnapshot[], prepared: PreparedDataset) {
  return limitsOf(
    rules.map((rule) => ({ ruleId: rule.ruleId, preset: rule.preset, values: rule.values })),
    prepared.roleColumn("transactions", "amount")?.name ?? null,
  );
}

/**
 * What a run's pattern search did, for the audit log. `byJev` says whether Jev ranked them, so a
 * ranking by code alone is plain to see.
 */
export function patternsAudit(
  runId: string,
  candidates: number,
  ranked: readonly RankedPattern[],
  raised: RunFlagsCount,
  jev: { model: string; asked: number } | null,
) {
  return {
    actor: SYSTEM_ACTOR,
    action: "run.patterns" as const,
    objectType: "run",
    objectId: runId,
    after: {
      name: runId,
      candidates,
      patterns: ranked.length,
      newFlags: raised.newFlags,
      seenAgain: raised.seenAgain,
      byJev: jev !== null,
    },
    ai: jev
      ? {
          provider: "typesafe",
          model: jev.model,
          promptVersion: PATTERN_QUESTION_SET,
          inputRef: createHash("sha256")
            .update(JSON.stringify(ranked.map((pattern) => patternKey(pattern))))
            .digest("hex"),
          output: { asked: jev.asked, ranked: ranked.length },
        }
      : null,
  };
}

/**
 * Looks for unusual patterns after a run, when Jev can rank them: code finds the candidates, Jev
 * says how concerning the strongest are, and the top ones become flags in the run lock. When Jev
 * keeps failing or isn't set up, code ranks them alone.
 */
@Injectable()
export class RunPatternsService implements OnModuleInit {
  private readonly logger = new Logger(RunPatternsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(ENV) private readonly env: Env,
    private readonly ai: AiClient,
    private readonly jobs: JobQueue,
    private readonly audit: AuditService,
    private readonly datasets: CheckDatasetsService,
    private readonly patterns: PatternFlagsService,
    private readonly writer: FlagWritingService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.jobs.register<PatternsJob>(
      PATTERNS_QUEUE,
      {
        retryLimit: this.env.PATTERN_RETRY_LIMIT,
        retryDelay: 2,
        retryBackoff: true,
        expireInSeconds: 900,
      },
      (job) => this.find(job),
    );
  }

  async find(
    job: Pick<JobWithMetadata<PatternsJob>, "data" | "retryCount" | "retryLimit">,
  ): Promise<void> {
    const { runId } = job.data;
    const run = await this.dataSource.getRepository(RunEntity).findOneBy({ id: runId });
    if (!run || !RunTotalsSchema.parse(run.totals).findingPatterns) return;
    const dataset = await this.datasets.byId(run.datasetId);
    const candidates = dataset
      ? preselect(
          findPatterns(
            dataset.prepared,
            runLimits(run.rules, dataset.prepared),
            rowsFlagged(await this.flaggedResults(runId), run.rules),
          ),
        )
      : [];
    let jev: { concerns: Map<string, number>; model: string } | null = null;
    if (candidates.length > 0) {
      try {
        jev = await this.askJev(candidates);
      } catch (error) {
        // Not set up, refused, or failing for the last time: code ranks them alone.
        const final =
          error instanceof AiNotConfigured ||
          error instanceof AiRefused ||
          job.retryCount >= job.retryLimit;
        if (!final) throw error;
        this.logger.warn(`Jev couldn't rank the patterns of ${runId}: ${messageOf(error)}`);
      }
    }
    const ranked = rankPatterns(candidates, jev?.concerns ?? null);
    const writing = (await this.ai.providers())?.textModel === true;
    await this.dataSource.transaction((manager) =>
      this.finish(manager, runId, dataset, candidates.length, ranked, writing, jev),
    );
  }

  private async finish(
    manager: EntityManager,
    runId: string,
    dataset: LoadedDataset | null,
    candidates: number,
    ranked: readonly RankedPattern[],
    writing: boolean,
    jev: { concerns: Map<string, number>; model: string } | null,
  ): Promise<void> {
    // After any run that holds the lock: flags and repeats are worked out one at a time.
    await manager.query("SELECT pg_advisory_xact_lock($1)", [RUNS_LOCK_KEY]);
    const locked = await manager.findOne(RunEntity, {
      where: { id: runId },
      lock: { mode: "pessimistic_write" },
    });
    if (!locked) return;
    const totals = RunTotalsSchema.parse(locked.totals);
    // Another attempt finished first.
    if (!totals.findingPatterns) return;
    const now = new Date();
    const raised = dataset
      ? await this.patterns.raise(manager, {
          runId,
          at: now,
          dataset,
          routing: locked.routing,
          ranked,
          writing,
        })
      : { newFlags: 0, seenAgain: 0, created: [] };
    if (writing) await this.writer.queue(manager, raised.created);
    await manager.update(
      RunEntity,
      { id: runId },
      {
        totals: {
          ...totals,
          patterns: ranked.length,
          findingPatterns: false,
          newFlags: totals.newFlags + raised.newFlags,
          seenAgain: totals.seenAgain + raised.seenAgain,
        },
      },
    );
    await this.audit.append(
      manager,
      patternsAudit(
        runId,
        candidates,
        ranked,
        raised,
        jev ? { model: jev.model, asked: jev.concerns.size } : null,
      ),
      now,
    );
  }

  /** The run's findings: which rule flagged which row. */
  private async flaggedResults(runId: string): Promise<Array<{ ruleId: string; rowNo: number }>> {
    const rows: Array<{ rule_id: string; row_no: number }> = await this.dataSource.query(
      "SELECT rule_id, row_no FROM run_results WHERE run_id = $1 AND outcome = 'flagged'",
      [runId],
    );
    return rows.map((row) => ({ ruleId: row.rule_id, rowNo: row.row_no }));
  }

  /**
   * Jev's concern about each candidate, a batch at a time: each candidate's description and facts,
   * with people as tokens and keys that name no one.
   */
  private async askJev(
    candidates: readonly PatternCandidate[],
  ): Promise<{ concerns: Map<string, number>; model: string }> {
    const concerns = new Map<string, number>();
    let model = "";
    for (let start = 0; start < candidates.length; start += PATTERN_RANK_BATCH) {
      const batch = candidates.slice(start, start + PATTERN_RANK_BATCH);
      const people = pseudonymsFor(
        batch.flatMap((candidate) =>
          candidate.facts
            .filter((fact) => PERSON_FACTS.has(fact.key))
            .map((fact) => String(fact.value)),
        ),
      );
      const response = await this.ai.rankPatterns({
        candidates: batch.map((candidate, index) => ({
          key: `p${start + index}`,
          detector: candidate.detector,
          description: patternDescription(candidate.detector, "en"),
          facts: candidate.facts
            .filter((fact) => !ROW_FACTS.has(fact.key))
            .map((fact) =>
              PERSON_FACTS.has(fact.key)
                ? { key: fact.key, value: people.hide(String(fact.value)) }
                : fact,
            ),
        })),
      });
      model = response.provenance.model;
      const byKey = new Map(response.ranks.map((rank) => [rank.key, rank.concern]));
      batch.forEach((candidate, index) => {
        const concern = byKey.get(`p${start + index}`);
        if (concern !== undefined) concerns.set(patternKey(candidate), concern);
      });
    }
    return { concerns, model };
  }
}
