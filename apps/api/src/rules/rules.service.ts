import { createHash, randomUUID } from "node:crypto";
import { decodeUtf8, type PolicyRule, splitPolicy, suggestedAction } from "@hrcc/engine";
import {
  type CreateRuleRequest,
  OPEN_RULE_STATUSES,
  type PolicyUploadResponse,
  PRESET_CATALOGUE,
  type RuleResponse,
  type RulesListResponse,
  type User,
} from "@hrcc/shared";
import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, type EntityManager, In, type QueryDeepPartialEntity } from "typeorm";
import { actorOf } from "../audit/actor.js";
import { AuditService } from "../audit/audit.service.js";
import { ApiException } from "../common/api-exception.js";
import { PolicyUploadEntity, RuleEntity, RuleVersionEntity } from "../database/entities/index.js";
import { CheckDatasetsService, type LoadedDataset } from "./check-datasets.service.js";
import { draftFromText, valuesOf } from "./drafting.js";
import { toRule } from "./rule-dto.js";

/** Serialises everything that picks rule IDs (pg_advisory_xact_lock key). */
const RULE_IDS_LOCK_KEY = 482_031;
const MAX_TITLE = 120;

/** What multer (memory storage) hands over for the uploaded policy. */
export interface UploadedPolicy {
  originalname: string;
  buffer: Buffer;
}

/** A version as inserted: every column, no relations. */
export type NewVersion = Omit<
  RuleVersionEntity,
  "createdBy" | "approvedBy" | "closedBy" | "ownerTeam" | "createdAt"
>;

export const VERSION_RELATIONS = {
  createdBy: true,
  approvedBy: true,
  closedBy: true,
  ownerTeam: true,
} as const;

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** TypeORM's write types map the check's untyped expressions to `{}`; these rows are complete. */
function versionRow(values: Partial<NewVersion>): QueryDeepPartialEntity<RuleVersionEntity> {
  return values as QueryDeepPartialEntity<RuleVersionEntity>;
}

/** A written rule's title: its first sentence, shortened like a policy heading. */
function titleOf(text: string): string {
  const first = text.split(/(?<=[.!?])\s+|\n/)[0]?.trim() || text.trim();
  const plain = first.replace(/[.\s]+$/, "") || first;
  return plain.length > MAX_TITLE ? `${plain.slice(0, MAX_TITLE - 1).trimEnd()}…` : plain;
}

/** The next `R-NN` after the highest one in use. */
async function nextRuleId(manager: EntityManager): Promise<string> {
  const rows: Array<{ id: string }> = await manager.query(
    "SELECT id FROM rules WHERE id ~ '^R-[0-9]+$'",
  );
  const highest = Math.max(0, ...rows.map((row) => Number(row.id.slice(2))));
  return `R-${String(highest + 1).padStart(2, "0")}`;
}

@Injectable()
export class RulesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly datasets: CheckDatasetsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Splits the policy into rules and drafts each new or changed one. An unchanged rule is left
   * alone; a changed one gets a new draft, which replaces any draft still open, while its live
   * version keeps running until the new draft is approved.
   */
  async uploadPolicy(admin: User, file: UploadedPolicy | undefined): Promise<PolicyUploadResponse> {
    if (!file) throw new ApiException(400, "file_missing", { file: "policy" });
    if (!/\.(md|markdown|txt)$/i.test(file.originalname)) {
      throw new ApiException(400, "file_type_not_allowed", { file: "policy" });
    }
    const text = decodeUtf8(file.buffer);
    if (text === null) {
      throw new ApiException(400, "file_unreadable", { file: "policy", reason: "not_utf8" });
    }
    if (text.trim() === "") {
      throw new ApiException(400, "file_unreadable", { file: "policy", reason: "empty" });
    }
    const dataset = await this.requireDataset();
    const { rules, warnings } = splitPolicy(text);
    const id = randomUUID();
    const digest = sha256(file.buffer);
    const outcome: Record<"created" | "changed" | "unchanged", string[]> = {
      created: [],
      changed: [],
      unchanged: [],
    };
    await this.dataSource.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock($1)", [RULE_IDS_LOCK_KEY]);
      await manager.insert(PolicyUploadEntity, {
        id,
        filename: file.originalname,
        sizeBytes: file.buffer.byteLength,
        sha256: digest,
        rulesFound: rules.length,
        warnings,
        uploadedById: admin.id,
      });
      for (const rule of rules) {
        outcome[await this.applyPolicyRule(manager, admin, id, rule, dataset)].push(rule.id);
      }
      await this.audit.append(manager, {
        actor: actorOf(admin),
        action: "policy.upload",
        objectType: "policy_upload",
        objectId: id,
        after: {
          name: file.originalname,
          sizeBytes: file.buffer.byteLength,
          sha256: digest,
          rulesFound: rules.length,
          ...outcome,
          warnings,
        },
      });
    });
    return {
      upload: { id, filename: file.originalname, rulesFound: rules.length, ...outcome, warnings },
    };
  }

  /** A rule an admin wrote: it gets the next free `R-NN` and a draft from its words. */
  async create(admin: User, body: CreateRuleRequest): Promise<RuleResponse> {
    const dataset = await this.requireDataset();
    const id = await this.dataSource.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock($1)", [RULE_IDS_LOCK_KEY]);
      const ruleId = await nextRuleId(manager);
      const title = titleOf(body.text);
      await manager.insert(RuleEntity, { id: ruleId, title, rowVersion: 1, createdById: admin.id });
      const version = this.drafted(ruleId, 1, body.text, null, admin, dataset);
      await manager.insert(RuleVersionEntity, versionRow(version));
      await this.audit.append(manager, {
        actor: actorOf(admin),
        action: "rule.create",
        objectType: "rule",
        objectId: ruleId,
        after: {
          name: ruleId,
          title,
          version: 1,
          status: version.status,
          preset: version.preset,
          values: valuesOf(version.parameters),
        },
      });
      return ruleId;
    });
    return this.detail(id);
  }

  async list(): Promise<RulesListResponse> {
    const [rules, versions, dataset] = await Promise.all([
      this.dataSource.getRepository(RuleEntity).find(),
      this.dataSource.getRepository(RuleVersionEntity).find({ relations: VERSION_RELATIONS }),
      this.datasets.latest(),
    ]);
    const byRule = new Map<string, RuleVersionEntity[]>();
    for (const version of versions) {
      byRule.set(version.ruleId, [...(byRule.get(version.ruleId) ?? []), version]);
    }
    return {
      rules: rules
        .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }))
        .map((rule) => toRule(rule, byRule.get(rule.id) ?? [])),
      dataset: dataset?.info ?? null,
    };
  }

  async detail(id: string): Promise<RuleResponse> {
    const rule = await this.dataSource.getRepository(RuleEntity).findOneBy({ id });
    if (!rule) throw new ApiException(404, "not_found");
    const [versions, dataset] = await Promise.all([
      this.dataSource
        .getRepository(RuleVersionEntity)
        .find({ where: { ruleId: id }, relations: VERSION_RELATIONS }),
      this.datasets.latest(),
    ]);
    return { rule: toRule(rule, versions), dataset: dataset?.info ?? null };
  }

  /** Creates the rule, opens a new draft when what the policy says changed, or leaves it alone. */
  private async applyPolicyRule(
    manager: EntityManager,
    admin: User,
    uploadId: string,
    rule: PolicyRule,
    dataset: LoadedDataset,
  ): Promise<"created" | "changed" | "unchanged"> {
    const existing = await manager.findOne(RuleEntity, {
      where: { id: rule.id },
      lock: { mode: "pessimistic_write" },
    });
    if (!existing) {
      await manager.insert(RuleEntity, {
        id: rule.id,
        title: rule.title,
        rowVersion: 1,
        createdById: admin.id,
      });
      await manager.insert(
        RuleVersionEntity,
        versionRow(this.drafted(rule.id, 1, rule.text, uploadId, admin, dataset)),
      );
      return "created";
    }
    const newest = await manager.findOneOrFail(RuleVersionEntity, {
      where: { ruleId: rule.id },
      order: { version: "DESC" },
    });
    if (newest.sourceText === rule.text && existing.title === rule.title) return "unchanged";
    const open = await this.openVersion(manager, rule.id);
    if (open) {
      await manager.update(
        RuleVersionEntity,
        { ruleId: rule.id, version: open.version },
        {
          status: "rejected",
          closedById: admin.id,
          closedAt: new Date(),
          closedFor: "policy_reupload",
        },
      );
    }
    await manager.insert(
      RuleVersionEntity,
      versionRow(this.drafted(rule.id, newest.version + 1, rule.text, uploadId, admin, dataset)),
    );
    await manager.update(
      RuleEntity,
      { id: rule.id },
      { title: rule.title, rowVersion: existing.rowVersion + 1 },
    );
    return "changed";
  }

  /** A new version drafted from the rule's words, with the check type's starting severity and fix. */
  private drafted(
    ruleId: string,
    version: number,
    text: string,
    policyUploadId: string | null,
    admin: User,
    dataset: LoadedDataset,
  ): NewVersion {
    const draft = draftFromText(text, dataset.prepared, dataset.info.vocabulary);
    return {
      ruleId,
      version,
      sourceText: text,
      policyUploadId,
      ...draft,
      severity: draft.preset ? PRESET_CATALOGUE[draft.preset].defaultSeverity : "Medium",
      ownerTeamId: null,
      suggestedActionEn: suggestedAction(draft.preset, "en"),
      suggestedActionAr: suggestedAction(draft.preset, "ar"),
      draftedBy: "keywords",
      datasetId: dataset.id,
      createdById: admin.id,
      approvedById: null,
      approvedAt: null,
      closedById: null,
      closedAt: null,
      reason: null,
      closedFor: null,
    };
  }

  /** Rules are drafted against the newest ready dataset; without one there is nothing to match. */
  private async requireDataset(): Promise<LoadedDataset> {
    const dataset = await this.datasets.latest();
    if (!dataset) throw new ApiException(409, "no_dataset");
    return dataset;
  }

  private openVersion(manager: EntityManager, id: string): Promise<RuleVersionEntity | null> {
    return manager.findOne(RuleVersionEntity, {
      where: { ruleId: id, status: In([...OPEN_RULE_STATUSES]) },
    });
  }
}
