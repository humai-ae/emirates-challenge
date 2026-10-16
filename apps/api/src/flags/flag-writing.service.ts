import { type Pseudonyms, pseudonymsFor } from "@hrcc/engine";
import type { AiExplainRequest, AiExplainResponse, Severity } from "@hrcc/shared";
import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { JobWithMetadata } from "pg-boss";
import { DataSource, type EntityManager, In } from "typeorm";
import { AiClient } from "../ai/ai-client.service.js";
import { AiFailed, AiNotConfigured, AiRefused } from "../ai/ai-errors.js";
import { SYSTEM_ACTOR } from "../audit/actor.js";
import { AuditService } from "../audit/audit.service.js";
import { ENV, type Env } from "../config/env.js";
import { FlagEntity, RuleVersionEntity } from "../database/entities/index.js";
import { JobQueue } from "../jobs/job-queue.service.js";

export const WRITE_QUEUE = "flags.write";
/** Flags per job, and calls to the AI service at once within a job. */
const BATCH = 25;
const CONCURRENCY = 4;

interface WriteJob {
  flagIds: string[];
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "unknown error");
const cut = (text: string, max: number) => (text.length > max ? text.slice(0, max) : text);

/** Runs `work` on each item, a few at a time. */
async function eachLimited<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      if (item !== undefined) await work(item);
    }
  });
  await Promise.all(workers);
}

/** What the AI service may see of a flag: its evidence and its rule, people as tokens. */
export function explainRequestFor(
  flag: FlagEntity,
  ruleText: string,
  people: Pseudonyms,
): AiExplainRequest {
  const both = (en: string, ar: string) => ({
    en: cut(people.hide(en), 1000),
    ar: cut(people.hide(ar), 1000),
  });
  return {
    kind: flag.kind === "ai_judgment" ? "ai_judgment" : "rule_break",
    rule: {
      id: cut(flag.ruleId, 32),
      title: cut(flag.ruleTitle, 200),
      text: cut(ruleText || flag.ruleTitle, 4000),
    },
    transactionId: flag.transactionIds[0] ? cut(flag.transactionIds[0], 64) : null,
    evidence: flag.evidence.slice(0, 30).map((item) => ({
      field: cut(item.field, 128),
      value: Array.isArray(item.value)
        ? item.value.slice(0, 50).map((value) => cut(people.hide(value), 100))
        : cut(people.hide(item.value), 500),
      condition: cut(people.hide(item.condition), 300),
    })),
    severity: flag.severity,
    team: flag.ownerTeam ? cut(flag.ownerTeam.nameEn, 80) : null,
    action: both(flag.standardFixEn, flag.standardFixAr),
    standard: both(flag.standardExplanationEn, flag.standardExplanationAr),
    judgment: flag.judgment
      ? { decision: flag.judgment.decision, likelihood: Math.round(flag.judgment.pBreak * 100) }
      : null,
    people: people.tokens,
  };
}

/**
 * Rewrites new flags' explanation and fix with AI, most severe first. The AI service checks every
 * text against the flag's facts and with Jev; a language that fails keeps the standard wording.
 * A flag decided before AI writes keeps the analyst's texts, and AI's update never changes the
 * row version, so an analyst's open page stays valid.
 */
@Injectable()
export class FlagWritingService implements OnModuleInit {
  private readonly logger = new Logger(FlagWritingService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(ENV) private readonly env: Env,
    private readonly ai: AiClient,
    private readonly jobs: JobQueue,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.jobs.register<WriteJob>(
      WRITE_QUEUE,
      {
        retryLimit: this.env.WRITE_RETRY_LIMIT,
        retryDelay: 5,
        retryBackoff: true,
        expireInSeconds: 900,
      },
      (job) => this.write(job),
    );
  }

  /**
   * Queues AI wording for new flags, most severe first, up to the limit; the rest keep the standard
   * wording. Runs in the transaction that raised them, so the jobs exist exactly when the flags do.
   */
  async queue(
    manager: EntityManager,
    created: ReadonlyArray<{ id: string; severity: Severity }>,
  ): Promise<void> {
    const written = created.slice(0, this.env.AI_WRITE_LIMIT).map((flag) => flag.id);
    const left = created.slice(this.env.AI_WRITE_LIMIT).map((flag) => flag.id);
    if (left.length > 0) {
      await manager.query("UPDATE flags SET writing = 'none' WHERE id = ANY($1)", [left]);
    }
    for (let start = 0; start < written.length; start += BATCH) {
      await this.jobs.send(manager, WRITE_QUEUE, { flagIds: written.slice(start, start + BATCH) });
    }
  }

  async write(
    job: Pick<JobWithMetadata<WriteJob>, "data" | "retryCount" | "retryLimit">,
  ): Promise<void> {
    const flags = await this.dataSource.getRepository(FlagEntity).find({
      where: { id: In(job.data.flagIds), writing: "pending" },
      relations: { ownerTeam: true },
      order: { severityRank: "ASC", id: "ASC" },
    });
    if (flags.length === 0) return;
    const texts = await this.ruleTexts(flags);
    const retry: string[] = [];
    let notSetUp = false;
    await eachLimited(flags, CONCURRENCY, async (flag) => {
      if (notSetUp) return;
      const people = pseudonymsFor(flag.people.map((person) => person.id));
      try {
        const answer = await this.ai.explain(
          explainRequestFor(flag, texts.get(`${flag.ruleId}@${flag.ruleVersion}`) ?? "", people),
        );
        await this.apply(flag.id, answer, people);
      } catch (error) {
        if (error instanceof AiNotConfigured) {
          notSetUp = true;
          return;
        }
        // Refused, or failing for the last time: the standard wording stays.
        if (error instanceof AiRefused || job.retryCount >= job.retryLimit) {
          await this.fail(flag.id, messageOf(error));
          return;
        }
        retry.push(flag.id);
      }
    });
    if (notSetUp) {
      await this.dataSource.query(
        "UPDATE flags SET writing = 'none' WHERE id = ANY($1) AND writing = 'pending'",
        [job.data.flagIds],
      );
      return;
    }
    // pg-boss tries the job again; flags already written are skipped.
    if (retry.length > 0) throw new AiFailed(`couldn't write ${retry.length} flags yet`);
  }

  private async apply(id: string, answer: AiExplainResponse, people: Pseudonyms): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const flag = await manager.findOne(FlagEntity, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      if (!flag || flag.writing !== "pending") return;
      // Decided while AI was writing: the analyst's texts stand.
      const open = flag.status === "with_analyst" && flag.decision === null;
      const en = open ? answer.en : null;
      const ar = open ? answer.ar : null;
      await manager.update(
        FlagEntity,
        { id },
        {
          explanationEn: en ? people.show(en.explanation) : flag.explanationEn,
          suggestedFixEn: en ? people.show(en.fix) : flag.suggestedFixEn,
          explanationSourceEn: en ? "ai" : flag.explanationSourceEn,
          explanationAr: ar ? people.show(ar.explanation) : flag.explanationAr,
          suggestedFixAr: ar ? people.show(ar.fix) : flag.suggestedFixAr,
          explanationSourceAr: ar ? "ai" : flag.explanationSourceAr,
          writing: open ? "done" : "none",
        },
      );
      if (!open) return;
      const languages = [...(en ? ["en"] : []), ...(ar ? ["ar"] : [])];
      await this.audit.append(manager, {
        actor: SYSTEM_ACTOR,
        action: languages.length > 0 ? "flag.write" : "flag.write_failed",
        objectType: "flag",
        objectId: id,
        after: { name: id, languages },
        ai: {
          provider: answer.provenance.provider,
          model: answer.provenance.model,
          promptVersion: answer.provenance.version,
          inputRef: answer.provenance.inputSha256,
          // People stay tokens here, as AI saw them.
          output: {
            en: answer.en,
            ar: answer.ar,
            rejected: answer.rejected,
            verification: answer.verification,
          },
        },
      });
    });
  }

  private async fail(id: string, problem: string): Promise<void> {
    this.logger.warn(`${id} keeps the standard wording: ${problem}`);
    await this.dataSource.transaction(async (manager) => {
      const flag = await manager.findOne(FlagEntity, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      if (!flag || flag.writing !== "pending") return;
      await manager.update(FlagEntity, { id }, { writing: "failed" });
      await this.audit.append(manager, {
        actor: SYSTEM_ACTOR,
        action: "flag.write_failed",
        objectType: "flag",
        objectId: id,
        after: { name: id, languages: [], problem },
      });
    });
  }

  /** Each rule version's text as the policy wrote it, by "R-01@1". */
  private async ruleTexts(flags: readonly FlagEntity[]): Promise<Map<string, string>> {
    const versions = await this.dataSource
      .getRepository(RuleVersionEntity)
      .findBy({ ruleId: In([...new Set(flags.map((flag) => flag.ruleId))]) });
    return new Map(versions.map((row) => [`${row.ruleId}@${row.version}`, row.sourceText]));
  }
}
