import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  decodeUtf8,
  findOwnerTable,
  type PolicyRule,
  previewCheck,
  splitPolicy,
  validateCheck,
} from "@hrcc/engine";
import {
  type CreateRuleRequest,
  type DraftingProgress,
  OPEN_RULE_STATUSES,
  type Parameter,
  type PolicyUploadResponse,
  type PresetId,
  type PreviewRuleRequest,
  type PreviewRuleResponse,
  type RuleChangeRequest,
  type RuleReasonRequest,
  type RuleRequest,
  type RuleRequestResponse,
  type RuleRequestsResponse,
  type RuleResponse,
  type RulesListResponse,
  type UpdateDraftRequest,
  type User,
} from "@hrcc/shared";
import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, type EntityManager, In, IsNull, Not } from "typeorm";
import { actorOf } from "../audit/actor.js";
import { AuditService } from "../audit/audit.service.js";
import { ApiException } from "../common/api-exception.js";
import {
  PolicyUploadEntity,
  RuleEntity,
  RuleVersionEntity,
  TeamEntity,
} from "../database/entities/index.js";
import { NoticesService } from "../notices/notices.service.js";
import { CheckDatasetsService, type LoadedDataset } from "./check-datasets.service.js";
import { buildDraft, valuesOf } from "./drafting.js";
import { DraftingService } from "./drafting.service.js";
import { toRule, toRuleRequest } from "./rule-dto.js";
import { type NewVersion, versionRow } from "./rule-rows.js";

/** Serialises everything that picks rule IDs (pg_advisory_xact_lock key). */
const RULE_IDS_LOCK_KEY = 482_031;
const MAX_TITLE = 120;

/** What multer (memory storage) hands over for the uploaded policy. */
export interface UploadedPolicy {
  originalname: string;
  buffer: Buffer;
}

export const VERSION_RELATIONS = {
  createdBy: true,
  approvedBy: true,
  closedBy: true,
  ownerTeam: true,
} as const;

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** A written rule's title: its first sentence, shortened like a policy heading. */
function titleOf(text: string): string {
  const first = text.split(/(?<=[.!?])\s+|\n/)[0]?.trim() || text.trim();
  const plain = first.replace(/[.\s]+$/, "") || first;
  return plain.length > MAX_TITLE ? `${plain.slice(0, MAX_TITLE - 1).trimEnd()}…` : plain;
}

/**
 * A written rule's ID: the next `W-NN` after the highest in use. Written rules have their own
 * prefix, so a policy's IDs (its own, or the `R-NN` given to headings without one) never meet them.
 */
async function nextRuleId(manager: EntityManager): Promise<string> {
  const rows: Array<{ id: string }> = await manager.query(
    "SELECT id FROM rules WHERE id ~ '^W-[0-9]+$'",
  );
  const highest = Math.max(0, ...rows.map((row) => Number(row.id.slice(2))));
  return `W-${String(highest + 1).padStart(2, "0")}`;
}

/**
 * A parameter the admin changed from the saved value is marked as theirs, and earlier marks stay.
 * Choosing another check type makes every value theirs.
 */
function markEdits(
  parameters: readonly Parameter[],
  saved: RuleVersionEntity,
  preset: PresetId,
): Parameter[] {
  return parameters.map((parameter) => {
    const before =
      saved.preset === preset
        ? saved.parameters.find((item) => item.name === parameter.name)
        : undefined;
    const edited =
      !before || before.editedByAdmin || !isDeepStrictEqual(before.value, parameter.value);
    return { ...parameter, editedByAdmin: edited };
  });
}

/** What the audit trail keeps of a version's settings. */
function settingsOf(
  version: Pick<
    RuleVersionEntity,
    "preset" | "parameters" | "severity" | "ownerTeamId" | "suggestedActionEn" | "suggestedActionAr"
  >,
) {
  return {
    preset: version.preset,
    values: valuesOf(version.parameters),
    severity: version.severity,
    ownerTeamId: version.ownerTeamId,
    suggestedActionEn: version.suggestedActionEn,
    suggestedActionAr: version.suggestedActionAr,
  };
}

@Injectable()
export class RulesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly datasets: CheckDatasetsService,
    private readonly audit: AuditService,
    private readonly drafting: DraftingService,
    private readonly notices: NoticesService,
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
    const split = splitPolicy(text);
    const ownerTable = findOwnerTable(text, dataset.info.vocabulary.types);
    const { rules } = split;
    const warnings = [...split.warnings];
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
        warnings: split.warnings,
        ownerTable,
        uploadedById: admin.id,
      });
      for (const rule of rules) {
        const result = await this.applyPolicyRule(manager, admin, id, rule, dataset);
        if (result === "taken") warnings.push({ code: "id_taken", id: rule.id, renamedTo: null });
        else outcome[result].push(rule.id);
      }
      if (warnings.length > split.warnings.length) {
        await manager.update(PolicyUploadEntity, { id }, { warnings });
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
          ownerTable,
        },
      });
    });
    return {
      upload: {
        id,
        filename: file.originalname,
        rulesFound: rules.length,
        ...outcome,
        warnings,
        ownerTable,
        drafting: this.drafting.background,
      },
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
      const version = await this.drafting.insert(
        manager,
        { ruleId, version: 1, text: body.text, policyUploadId: null, createdById: admin.id },
        dataset,
      );
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

  /** A rule someone asked for: written like an admin's (`W-NN`), drafted for the admin's review. */
  async request(user: User, body: CreateRuleRequest): Promise<RuleRequestResponse> {
    const dataset = await this.requireDataset();
    const id = await this.dataSource.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock($1)", [RULE_IDS_LOCK_KEY]);
      const ruleId = await nextRuleId(manager);
      const title = titleOf(body.text);
      await manager.insert(RuleEntity, {
        id: ruleId,
        title,
        rowVersion: 1,
        createdById: user.id,
        requestedById: user.id,
      });
      const version = await this.drafting.insert(
        manager,
        { ruleId, version: 1, text: body.text, policyUploadId: null, createdById: user.id },
        dataset,
      );
      await this.audit.append(manager, {
        actor: actorOf(user),
        action: "rule.request",
        objectType: "rule",
        objectId: ruleId,
        after: { name: ruleId, title, status: version.status },
      });
      return ruleId;
    });
    const [request] = await this.loadRequests({ id });
    if (!request) throw new Error(`Request ${id} was not saved`);
    return { request };
  }

  /** Every request for an admin; an analyst's own otherwise. Newest first. */
  async requests(user: User): Promise<RuleRequestsResponse> {
    return {
      requests: await this.loadRequests(user.role === "admin" ? {} : { requestedById: user.id }),
    };
  }

  private async loadRequests(where: {
    id?: string;
    requestedById?: string;
  }): Promise<RuleRequest[]> {
    const rules = await this.dataSource.getRepository(RuleEntity).find({
      where: { requestedById: Not(IsNull()), ...where },
      relations: { requestedBy: true },
      order: { createdAt: "DESC", id: "DESC" },
    });
    if (rules.length === 0) return [];
    const versions = await this.dataSource
      .getRepository(RuleVersionEntity)
      .findBy({ ruleId: In(rules.map((rule) => rule.id)) });
    return rules.map((rule) =>
      toRuleRequest(
        rule,
        versions.filter((version) => version.ruleId === rule.id),
      ),
    );
  }

  /** Drafts the open version again: by AI in the background, or now from the rule's words. */
  async redraft(admin: User, id: string, body: RuleChangeRequest): Promise<RuleResponse> {
    const dataset = await this.requireDataset();
    await this.dataSource.transaction(async (manager) => {
      const rule = await this.lock(manager, id, body.rowVersion);
      const open = await this.openVersion(manager, id);
      if (!open) throw new ApiException(409, "rule_not_open");
      const row = await this.drafting.redraft(manager, open, dataset);
      await manager.update(RuleEntity, { id }, { rowVersion: rule.rowVersion + 1 });
      await this.audit.append(manager, {
        actor: actorOf(admin),
        action: "rule.redraft",
        objectType: "rule",
        objectId: id,
        before: { version: open.version, status: open.status, ...settingsOf(open) },
        after: { name: id, version: open.version, status: row.status },
      });
    });
    return this.detail(id);
  }

  async list(): Promise<RulesListResponse> {
    const [rules, versions, dataset, drafting] = await Promise.all([
      this.dataSource.getRepository(RuleEntity).find({ relations: { requestedBy: true } }),
      this.dataSource.getRepository(RuleVersionEntity).find({ relations: VERSION_RELATIONS }),
      this.datasets.latest(),
      this.draftingProgress(),
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
      drafting,
    };
  }

  async detail(id: string): Promise<RuleResponse> {
    const rule = await this.dataSource
      .getRepository(RuleEntity)
      .findOne({ where: { id }, relations: { requestedBy: true } });
    if (!rule) throw new ApiException(404, "not_found");
    const [versions, dataset] = await Promise.all([
      this.dataSource
        .getRepository(RuleVersionEntity)
        .find({ where: { ruleId: id }, relations: VERSION_RELATIONS }),
      this.datasets.latest(),
    ]);
    return { rule: toRule(rule, versions), dataset: dataset?.info ?? null };
  }

  /** What a check type with these values would do on the newest dataset; nothing is saved. */
  async preview(body: PreviewRuleRequest): Promise<PreviewRuleResponse> {
    const dataset = await this.requireDataset();
    const summary = {
      id: dataset.id,
      name: dataset.info.name,
      transactionCount: dataset.info.transactionCount,
    };
    const built = buildDraft(body.preset, body.values, dataset.prepared);
    if ("issues" in built) {
      return { dataset: summary, result: { status: "invalid_parameters", issues: built.issues } };
    }
    if (!built.check) {
      return { dataset: summary, result: { status: "needs_data", needs: built.needs } };
    }
    return {
      dataset: summary,
      result: {
        status: "ok",
        check: built.check,
        restatementEn: built.restatementEn,
        restatementAr: built.restatementAr,
        preview: previewCheck(dataset.prepared, built.check),
      },
    };
  }

  /** Saves the admin's check type, values and settings on the open draft, rebuilt on the newest data. */
  async updateDraft(admin: User, id: string, body: UpdateDraftRequest): Promise<RuleResponse> {
    const dataset = await this.requireDataset();
    await this.dataSource.transaction(async (manager) => {
      const rule = await this.lock(manager, id, body.rowVersion);
      const open = await this.openVersion(manager, id);
      if (!open) throw new ApiException(409, "rule_not_open");
      if (
        body.ownerTeamId !== null &&
        !(await manager.existsBy(TeamEntity, { id: body.ownerTeamId }))
      ) {
        throw new ApiException(400, "team_not_found");
      }
      const built = buildDraft(body.preset, body.values, dataset.prepared);
      if ("issues" in built) {
        throw new ApiException(400, "validation_failed", {
          issues: built.issues.map((issue) => ({
            path: `values.${issue.parameter}`,
            code: "custom",
            message: issue.problem,
          })),
        });
      }
      const parameters = markEdits(built.parameters, open, built.preset);
      const changes = {
        status: built.status,
        preset: built.preset,
        parameters,
        check: built.check && { ...built.check, parameters },
        needs: built.needs,
        restatementEn: built.restatementEn,
        restatementAr: built.restatementAr,
        severity: body.severity,
        ownerTeamId: body.ownerTeamId,
        suggestedActionEn: body.suggestedActionEn,
        suggestedActionAr: body.suggestedActionAr,
        draftedBy:
          open.draftedBy === "keywords" && open.preset === built.preset ? open.draftedBy : "admin",
        draftError: null,
        datasetId: dataset.id,
      } satisfies Partial<NewVersion>;
      await manager.update(
        RuleVersionEntity,
        { ruleId: id, version: open.version },
        versionRow(changes),
      );
      await manager.update(RuleEntity, { id }, { rowVersion: rule.rowVersion + 1 });
      await this.audit.append(manager, {
        actor: actorOf(admin),
        action: "rule.draft_update",
        objectType: "rule",
        objectId: id,
        before: { version: open.version, status: open.status, ...settingsOf(open) },
        after: { name: id, version: open.version, status: changes.status, ...settingsOf(changes) },
      });
    });
    return this.detail(id);
  }

  /**
   * Puts the open draft live after checking it again on the newest data, which may have changed
   * since it was saved. The version it replaces is retired.
   */
  async approve(admin: User, id: string, body: RuleChangeRequest): Promise<RuleResponse> {
    const dataset = await this.requireDataset();
    await this.dataSource.transaction(async (manager) => {
      const rule = await this.lock(manager, id, body.rowVersion);
      const open = await this.openVersion(manager, id);
      if (!open) throw new ApiException(409, "rule_not_open");
      if (
        open.status !== "draft" ||
        !open.check ||
        !validateCheck(open.check, dataset.prepared).ok
      ) {
        throw new ApiException(409, "check_invalid");
      }
      const now = new Date();
      const live = await this.liveVersion(manager, id);
      if (live) {
        await manager.update(
          RuleVersionEntity,
          { ruleId: id, version: live.version },
          { status: "retired", closedById: admin.id, closedAt: now, closedFor: "replaced" },
        );
      }
      await manager.update(
        RuleVersionEntity,
        { ruleId: id, version: open.version },
        { status: "active", approvedById: admin.id, approvedAt: now },
      );
      await manager.update(RuleEntity, { id }, { rowVersion: rule.rowVersion + 1 });
      await this.audit.append(manager, {
        actor: actorOf(admin),
        action: "rule.approve",
        objectType: "rule",
        objectId: id,
        before: live ? { liveVersion: live.version } : null,
        after: { name: id, version: open.version, ...settingsOf(open) },
      });
      // The analyst who asked for the rule hears when it first goes live.
      if (!live) {
        await this.notices.notify(manager, [rule.requestedById], admin.id, "rule_request_live", {
          ruleId: id,
          title: rule.title,
        });
      }
    });
    return this.detail(id);
  }

  async reject(admin: User, id: string, body: RuleReasonRequest): Promise<RuleResponse> {
    await this.dataSource.transaction(async (manager) => {
      const rule = await this.lock(manager, id, body.rowVersion);
      const open = await this.openVersion(manager, id);
      if (!open) throw new ApiException(409, "rule_not_open");
      await manager.update(
        RuleVersionEntity,
        { ruleId: id, version: open.version },
        { status: "rejected", closedById: admin.id, closedAt: new Date(), reason: body.reason },
      );
      await manager.update(RuleEntity, { id }, { rowVersion: rule.rowVersion + 1 });
      await this.audit.append(manager, {
        actor: actorOf(admin),
        action: "rule.reject",
        objectType: "rule",
        objectId: id,
        reason: body.reason,
        after: { name: id, version: open.version },
      });
      if (!(await this.liveVersion(manager, id))) {
        await this.notices.notify(
          manager,
          [rule.requestedById],
          admin.id,
          "rule_request_rejected",
          { ruleId: id, title: rule.title, reason: body.reason },
        );
      }
    });
    return this.detail(id);
  }

  /**
   * Opens a new draft copied from the live version, or from the newest version when nothing is
   * live, so a rejected or retired rule can be drafted again. The live version keeps running.
   */
  async edit(admin: User, id: string, body: RuleChangeRequest): Promise<RuleResponse> {
    await this.dataSource.transaction(async (manager) => {
      const rule = await this.lock(manager, id, body.rowVersion);
      if (await this.openVersion(manager, id)) throw new ApiException(409, "rule_draft_open");
      const newest = await manager.findOneOrFail(RuleVersionEntity, {
        where: { ruleId: id },
        order: { version: "DESC" },
      });
      const source = (await this.liveVersion(manager, id)) ?? newest;
      const version = newest.version + 1;
      const copy: NewVersion = {
        ruleId: id,
        version,
        status: source.check
          ? "draft"
          : source.draftError || !source.preset
            ? "draft_failed"
            : "needs_data",
        sourceText: source.sourceText,
        policyUploadId: source.policyUploadId,
        preset: source.preset,
        parameters: source.parameters,
        check: source.check,
        needs: source.needs,
        restatementEn: source.restatementEn,
        restatementAr: source.restatementAr,
        severity: source.severity,
        ownerTeamId: source.ownerTeamId,
        suggestedActionEn: source.suggestedActionEn,
        suggestedActionAr: source.suggestedActionAr,
        draftedBy: source.draftedBy,
        draftError: source.check
          ? null
          : (source.draftError ?? (source.preset ? null : "no_match")),
        draftMeta: source.draftMeta,
        datasetId: source.datasetId,
        createdById: admin.id,
        approvedById: null,
        approvedAt: null,
        closedById: null,
        closedAt: null,
        reason: null,
        closedFor: null,
      };
      await manager.insert(RuleVersionEntity, versionRow(copy));
      await manager.update(RuleEntity, { id }, { rowVersion: rule.rowVersion + 1 });
      await this.audit.append(manager, {
        actor: actorOf(admin),
        action: "rule.edit",
        objectType: "rule",
        objectId: id,
        after: { name: id, version, copiedFrom: source.version },
      });
    });
    return this.detail(id);
  }

  /** Retires the live version; a draft still open is rejected with it. */
  async retire(admin: User, id: string, body: RuleReasonRequest): Promise<RuleResponse> {
    await this.dataSource.transaction(async (manager) => {
      const rule = await this.lock(manager, id, body.rowVersion);
      const live = await this.liveVersion(manager, id);
      if (!live) throw new ApiException(409, "rule_not_active");
      const now = new Date();
      const open = await this.openVersion(manager, id);
      if (open) {
        await manager.update(
          RuleVersionEntity,
          { ruleId: id, version: open.version },
          { status: "rejected", closedById: admin.id, closedAt: now, closedFor: "rule_retired" },
        );
      }
      await manager.update(
        RuleVersionEntity,
        { ruleId: id, version: live.version },
        { status: "retired", closedById: admin.id, closedAt: now, reason: body.reason },
      );
      await manager.update(RuleEntity, { id }, { rowVersion: rule.rowVersion + 1 });
      await this.audit.append(manager, {
        actor: actorOf(admin),
        action: "rule.retire",
        objectType: "rule",
        objectId: id,
        reason: body.reason,
        after: { name: id, version: live.version, closedDraft: open?.version ?? null },
      });
    });
    return this.detail(id);
  }

  /**
   * Creates the rule, opens a new draft when what the policy says changed, or leaves it alone.
   * A rule an admin wrote is never touched: `taken`.
   */
  private async applyPolicyRule(
    manager: EntityManager,
    admin: User,
    uploadId: string,
    rule: PolicyRule,
    dataset: LoadedDataset,
  ): Promise<"created" | "changed" | "unchanged" | "taken"> {
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
      await this.drafting.insert(
        manager,
        {
          ruleId: rule.id,
          version: 1,
          text: rule.text,
          policyUploadId: uploadId,
          createdById: admin.id,
        },
        dataset,
      );
      return "created";
    }
    // A rule an admin wrote belongs to them, whatever a policy says.
    const written = await manager.exists(RuleVersionEntity, {
      where: { ruleId: rule.id, version: 1, policyUploadId: IsNull() },
    });
    if (written) return "taken";
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
    await this.drafting.insert(
      manager,
      {
        ruleId: rule.id,
        version: newest.version + 1,
        text: rule.text,
        policyUploadId: uploadId,
        createdById: admin.id,
      },
      dataset,
    );
    await manager.update(
      RuleEntity,
      { id: rule.id },
      { title: rule.title, rowVersion: existing.rowVersion + 1 },
    );
    return "changed";
  }

  /** The newest policy upload's versions: how many are drafted, while any is still drafting. */
  private async draftingProgress(): Promise<DraftingProgress | null> {
    const [row]: Array<{ done: number; total: number }> = await this.dataSource.query(`
      SELECT count(*) FILTER (WHERE status <> 'drafting')::int AS done, count(*)::int AS total
      FROM rule_versions
      WHERE policy_upload_id = (SELECT id FROM policy_uploads ORDER BY created_at DESC, id LIMIT 1)`);
    return row && row.total > row.done ? { done: row.done, total: row.total } : null;
  }

  /** The rule, locked until the transaction ends, if the admin's copy is current. */
  private async lock(manager: EntityManager, id: string, rowVersion: number): Promise<RuleEntity> {
    const rule = await manager.findOne(RuleEntity, {
      where: { id },
      lock: { mode: "pessimistic_write" },
    });
    if (!rule) throw new ApiException(404, "not_found");
    if (rule.rowVersion !== rowVersion) throw new ApiException(409, "rule_changed");
    return rule;
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

  private liveVersion(manager: EntityManager, id: string): Promise<RuleVersionEntity | null> {
    return manager.findOne(RuleVersionEntity, { where: { ruleId: id, status: "active" } });
  }
}
