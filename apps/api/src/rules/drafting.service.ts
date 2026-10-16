import { aiDraftInput, composeAiDraft, suggestedAction } from "@hrcc/engine";
import {
  type AuditAi,
  type DraftMeta,
  type ParameterValue,
  PRESET_CATALOGUE,
  type PresetId,
  type Severity,
} from "@hrcc/shared";
import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { JobWithMetadata } from "pg-boss";
import { DataSource, type EntityManager } from "typeorm";
import { AiClient } from "../ai/ai-client.service.js";
import { AiNotConfigured, AiRefused } from "../ai/ai-errors.js";
import { SYSTEM_ACTOR } from "../audit/actor.js";
import { AuditService } from "../audit/audit.service.js";
import { ENV, type Env } from "../config/env.js";
import { RoutingRuleEntity, RuleEntity, RuleVersionEntity } from "../database/entities/index.js";
import { JobQueue } from "../jobs/job-queue.service.js";
import { CheckDatasetsService, type LoadedDataset } from "./check-datasets.service.js";
import {
  type DraftFields,
  draftFromAi,
  draftFromText,
  failedDraft,
  valuesOf,
  WAITING,
} from "./drafting.js";
import { type NewVersion, type VersionBase, versionOf, versionRow } from "./rule-rows.js";

export const DRAFT_QUEUE = "rule.draft";

interface DraftJob {
  ruleId: string;
  version: number;
}

/** What the job decided before the suggested action is written. */
interface Decided {
  fields: DraftFields;
  severity: Severity;
  ai: DraftMeta["ai"];
  aiProblem: DraftMeta["aiProblem"];
  audit: AuditAi | null;
}

/** The team that owns every one of these transaction types, when one team does. */
export function ownerFor(
  types: ParameterValue | undefined,
  routing: ReadonlyMap<string, string>,
): string | null {
  if (!Array.isArray(types) || types.length === 0) return null;
  const teams = new Set(types.map((type) => routing.get(type)));
  const [team] = teams;
  return teams.size === 1 && team !== undefined ? team : null;
}

const baseOf = (row: RuleVersionEntity): VersionBase => ({
  ruleId: row.ruleId,
  version: row.version,
  text: row.sourceText,
  policyUploadId: row.policyUploadId,
  createdById: row.createdById,
});

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "unknown error");

async function routingOf(manager: EntityManager): Promise<Map<string, string>> {
  const rows = await manager.find(RoutingRuleEntity);
  return new Map(rows.map((row) => [row.transactionType, row.teamId]));
}

/**
 * Drafts rule versions. With the AI service set, a new version waits as `drafting` while a job
 * drafts it with AI (TypeSafe Jev picks the check type and values; the text model writes the
 * suggested action); otherwise it is drafted at once from the rule's words.
 */
@Injectable()
export class DraftingService implements OnModuleInit {
  private readonly logger = new Logger(DraftingService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(ENV) private readonly env: Env,
    private readonly datasets: CheckDatasetsService,
    private readonly ai: AiClient,
    private readonly jobs: JobQueue,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.jobs.register<DraftJob>(
      DRAFT_QUEUE,
      {
        retryLimit: this.env.DRAFT_RETRY_LIMIT,
        retryDelay: 2,
        retryBackoff: true,
        expireInSeconds: 300,
      },
      (job) => this.draft(job),
    );
  }

  /** New versions are drafted in the background by AI, or here and now from keywords. */
  get background(): boolean {
    return this.jobs.enabled;
  }

  /** Inserts a new version: drafted now from keywords, or waiting with its job queued alongside. */
  async insert(
    manager: EntityManager,
    base: VersionBase,
    dataset: LoadedDataset,
  ): Promise<NewVersion> {
    const row = await this.prepare(manager, base, dataset);
    await manager.insert(RuleVersionEntity, versionRow(row));
    if (this.background)
      await this.jobs.send(manager, DRAFT_QUEUE, { ruleId: base.ruleId, version: base.version });
    return row;
  }

  /** Drafts an open version again in place, dropping the admin's edits to it. */
  async redraft(
    manager: EntityManager,
    open: RuleVersionEntity,
    dataset: LoadedDataset,
  ): Promise<NewVersion> {
    const row = await this.prepare(manager, baseOf(open), dataset);
    await manager.update(
      RuleVersionEntity,
      { ruleId: open.ruleId, version: open.version },
      versionRow(row),
    );
    if (this.background)
      await this.jobs.send(manager, DRAFT_QUEUE, { ruleId: open.ruleId, version: open.version });
    return row;
  }

  private async prepare(
    manager: EntityManager,
    base: VersionBase,
    dataset: LoadedDataset,
  ): Promise<NewVersion> {
    if (this.background) {
      return versionOf(base, dataset.id, WAITING, {
        severity: "Medium",
        ownerTeamId: null,
        suggestedActionEn: suggestedAction(null, "en"),
        suggestedActionAr: suggestedAction(null, "ar"),
        draftedBy: "ai",
        draftMeta: null,
      });
    }
    const fields = draftFromText(base.text, dataset.prepared, dataset.info.vocabulary);
    return versionOf(base, dataset.id, fields, {
      severity: fields.preset ? PRESET_CATALOGUE[fields.preset].defaultSeverity : "Medium",
      ownerTeamId: ownerFor(valuesOf(fields.parameters).types, await routingOf(manager)),
      suggestedActionEn: suggestedAction(fields.preset, "en"),
      suggestedActionAr: suggestedAction(fields.preset, "ar"),
      draftedBy: "keywords",
      draftMeta: null,
    });
  }

  /** The job: drafts one waiting version, and leaves alone one closed or drafted meanwhile. */
  async draft(
    job: Pick<JobWithMetadata<DraftJob>, "data" | "retryCount" | "retryLimit">,
  ): Promise<void> {
    const { ruleId, version } = job.data;
    const row = await this.dataSource
      .getRepository(RuleVersionEntity)
      .findOneBy({ ruleId, version });
    if (row?.status !== "drafting") return;
    const rule = await this.dataSource.getRepository(RuleEntity).findOneByOrFail({ id: ruleId });
    const dataset = await this.datasets.latest();
    const decided: Decided = dataset
      ? await this.decide(row, dataset, job.retryCount >= job.retryLimit)
      : { fields: failedDraft(), severity: "Medium", ai: null, aiProblem: null, audit: null };
    const action = await this.writeAction(rule, row.sourceText, decided.fields.preset);
    await this.dataSource.transaction(async (manager) => {
      const locked = await manager.findOne(RuleEntity, {
        where: { id: ruleId },
        lock: { mode: "pessimistic_write" },
      });
      const current = await manager.findOneBy(RuleVersionEntity, { ruleId, version });
      if (!locked || current?.status !== "drafting") return;
      const next = versionOf(baseOf(current), dataset?.id ?? current.datasetId, decided.fields, {
        severity: decided.severity,
        ownerTeamId: ownerFor(valuesOf(decided.fields.parameters).types, await routingOf(manager)),
        suggestedActionEn: action.en,
        suggestedActionAr: action.ar,
        draftedBy: decided.ai ? "ai" : "keywords",
        draftMeta: { ai: decided.ai, aiProblem: decided.aiProblem, suggestedActionBy: action.by },
      });
      await manager.update(RuleVersionEntity, { ruleId, version }, versionRow(next));
      await manager.update(RuleEntity, { id: ruleId }, { rowVersion: locked.rowVersion + 1 });
      await this.audit.append(manager, {
        actor: SYSTEM_ACTOR,
        action: "rule.draft",
        objectType: "rule",
        objectId: ruleId,
        after: {
          name: ruleId,
          version,
          status: next.status,
          preset: next.preset,
          values: valuesOf(next.parameters),
          draftedBy: next.draftedBy,
          aiProblem: decided.aiProblem,
          suggestedActionBy: action.by,
        },
        ai: decided.audit,
      });
    });
  }

  /** AI's draft; or, when AI isn't set up or has failed for the last time, the rule's words. */
  private async decide(
    row: RuleVersionEntity,
    dataset: LoadedDataset,
    lastAttempt: boolean,
  ): Promise<Decided> {
    try {
      const { request, context } = aiDraftInput(
        row.sourceText,
        dataset.info.columns,
        dataset.info.vocabulary,
      );
      const answer = await this.ai.draftRule(request);
      const draft = composeAiDraft(answer, context);
      const { provenance } = answer;
      return {
        fields: draft ? draftFromAi(draft, dataset.prepared) : failedDraft(),
        severity: answer.severity.value,
        ai: {
          model: provenance.model,
          questionSet: provenance.version,
          confidence: draft?.confidence ?? 0,
          weakest: draft?.weakest ?? "preset",
        },
        aiProblem: null,
        audit: {
          provider: provenance.provider,
          model: provenance.model,
          promptVersion: provenance.version,
          inputRef: provenance.inputSha256,
          output: draft
            ? {
                preset: draft.preset,
                values: draft.values,
                confidence: draft.confidence,
                weakest: draft.weakest,
              }
            : { preset: null },
        },
      };
    } catch (error) {
      // Not set up or refused: no point trying again. Failing: pg-boss tries again until the last attempt.
      const final = error instanceof AiNotConfigured || error instanceof AiRefused;
      if (!final && !lastAttempt) throw error;
      this.logger.warn(
        `Drafting ${row.ruleId} v${row.version} from its words: ${messageOf(error)}`,
      );
      const fields = draftFromText(row.sourceText, dataset.prepared, dataset.info.vocabulary);
      return {
        fields,
        severity: fields.preset ? PRESET_CATALOGUE[fields.preset].defaultSeverity : "Medium",
        ai: null,
        aiProblem: error instanceof AiNotConfigured ? "not_configured" : "unavailable",
        audit: null,
      };
    }
  }

  /** The text model's suggested action, or the check type's standard wording when it can't give one. */
  private async writeAction(rule: RuleEntity, text: string, preset: PresetId | null) {
    const template = {
      en: suggestedAction(preset, "en"),
      ar: suggestedAction(preset, "ar"),
      by: "template" as "ai" | "template",
    };
    try {
      const action = await this.ai.ruleAction({
        ruleId: rule.id.slice(0, 32),
        title: rule.title.slice(0, 200),
        text: text.slice(0, 4000),
        referenceEn: template.en,
      });
      return { en: action.en, ar: action.ar, by: "ai" as const };
    } catch (error) {
      if (!(error instanceof AiNotConfigured)) {
        this.logger.warn(`${rule.id} keeps the standard suggested action: ${messageOf(error)}`);
      }
      return template;
    }
  }
}
