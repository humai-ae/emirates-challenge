import { dubaiDay, dueDateFor, levelFor, namedPerson } from "@hrcc/engine";
import {
  type AssignFlagRequest,
  type ConfirmFlagRequest,
  type CountsResponse,
  DEFAULT_FLAG_SETTINGS,
  DISMISS_REASONS_FOR,
  type DismissFlagRequest,
  type FixChecksResponse,
  type FixFlagRequest,
  type FlagAction,
  type FlagAssignment,
  type FlagChange,
  type FlagDecision,
  type FlagDetail,
  type FlagFix,
  type FlagKind,
  type FlagResponse,
  type FlagSentBack,
  type FlagVerification,
  type InboxQuery,
  type InboxResponse,
  type QueueResponse,
  type ReportTo,
  type SendBackFlagRequest,
  type Severity,
  type SeverityReason,
  type User,
  type VerifyFlagRequest,
} from "@hrcc/shared";
import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, type EntityManager, In } from "typeorm";
import { actorOf } from "../audit/actor.js";
import { AuditService } from "../audit/audit.service.js";
import { toTeamSummary } from "../auth/users.service.js";
import { ApiException } from "../common/api-exception.js";
import {
  FlagEntity,
  RuleVersionEntity,
  RunEntity,
  TeamEntity,
  UserEntity,
} from "../database/entities/index.js";
import { NoticesService } from "../notices/notices.service.js";
import { toFlagDetail, toFlagSummary } from "./flag-dto.js";
import { allowedActions, canRead, guardOf, isOwnFix } from "./flag-rules.js";

interface Cursor {
  rank: number;
  createdAt: string;
  id: string;
}

/** Where an inbox page ended: severity rank, creation time and ID, the inbox's sort order. */
function encodeCursor(flag: FlagEntity): string {
  return Buffer.from(
    JSON.stringify([flag.severityRank, flag.createdAt.toISOString(), flag.id]),
  ).toString("base64url");
}

function decodeCursor(after: string | undefined): Cursor | null {
  if (after === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(after, "base64url").toString("utf8"));
    if (Array.isArray(parsed)) {
      const [rank, createdAt, id] = parsed;
      if (typeof rank === "number" && typeof createdAt === "string" && typeof id === "string") {
        return { rank, createdAt, id };
      }
    }
  } catch {
    // Not a cursor this API wrote.
  }
  throw new ApiException(400, "validation_failed", {
    issues: [{ path: ["after"], message: "invalid" }],
  });
}

const today = () => dubaiDay(new Date());

@Injectable()
export class FlagsService {
  constructor(
    @InjectDataSource() protected readonly dataSource: DataSource,
    protected readonly audit: AuditService,
    protected readonly notices: NoticesService,
  ) {}

  /** Flags waiting for an analyst's decision: most severe first, then oldest. */
  async inbox(query: InboxQuery): Promise<InboxResponse> {
    const filtered = this.dataSource
      .getRepository(FlagEntity)
      .createQueryBuilder("flag")
      .leftJoinAndSelect("flag.ownerTeam", "team")
      .where("flag.status = 'with_analyst'");
    if (query.severity)
      filtered.andWhere("flag.severity = :severity", { severity: query.severity });
    if (query.kind) filtered.andWhere("flag.kind = :kind", { kind: query.kind });
    if (query.ruleId) filtered.andWhere("flag.ruleId = :ruleId", { ruleId: query.ruleId });
    if (query.teamId === "none") filtered.andWhere("flag.ownerTeamId IS NULL");
    else if (query.teamId)
      filtered.andWhere("flag.ownerTeamId = :teamId", { teamId: query.teamId });
    if (query.runId) filtered.andWhere("flag.runId = :runId", { runId: query.runId });
    const matching = await filtered.clone().getCount();
    const page = filtered
      .clone()
      .orderBy("flag.severityRank", "ASC")
      .addOrderBy("flag.createdAt", "ASC")
      .addOrderBy("flag.id", "ASC")
      .limit(query.limit + 1);
    const cursor = decodeCursor(query.after);
    if (cursor) {
      page.andWhere(
        `("flag"."severity_rank", "flag"."created_at", "flag"."id") > (:rank, :createdAt, :id)`,
        cursor,
      );
    }
    const rows = await page.getMany();
    const shown = rows.slice(0, query.limit);
    const last = shown.at(-1);

    const counted = async <K extends string>(column: "severity" | "kind", keys: readonly K[]) => {
      const counts: Array<{ key: K; count: number }> = await this.dataSource.query(
        `SELECT ${column} AS key, count(*)::int AS count FROM flags WHERE status = 'with_analyst' GROUP BY ${column}`,
      );
      const result = Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
      for (const { key, count } of counts) result[key] = count;
      return result;
    };
    const bySeverity = await counted<Severity>("severity", ["High", "Medium", "Low"]);
    const byKind = await counted<FlagKind>("kind", [
      "rule_break",
      "ai_judgment",
      "unusual_pattern",
    ]);
    const rules: Array<{ id: string; title: string }> = await this.dataSource.query(
      "SELECT rule_id AS id, min(rule_title) AS title FROM flags WHERE status = 'with_analyst' GROUP BY rule_id",
    );
    const teams = await this.dataSource
      .getRepository(TeamEntity)
      .createQueryBuilder("team")
      .where(
        "team.id IN (SELECT owner_team_id FROM flags WHERE status = 'with_analyst' AND owner_team_id IS NOT NULL)",
      )
      .orderBy("team.nameEn", "ASC")
      .getMany();
    const runs: Array<{ run_id: string }> = await this.dataSource.query(
      "SELECT DISTINCT run_id FROM flags WHERE status = 'with_analyst' ORDER BY run_id DESC",
    );
    const [lastRun] = await this.dataSource
      .getRepository(RunEntity)
      .find({ order: { startedAt: "DESC", id: "DESC" }, take: 1 });
    const now = today();
    return {
      flags: shown.map((flag) => toFlagSummary(flag, now)),
      nextAfter: rows.length > query.limit && last ? encodeCursor(last) : null,
      matching,
      total: bySeverity.High + bySeverity.Medium + bySeverity.Low,
      bySeverity,
      byKind,
      filters: {
        rules: rules.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true })),
        teams: teams.map(toTeamSummary),
        runs: runs.map((row) => row.run_id),
      },
      lastRun: lastRun ? { id: lastRun.id, finishedAt: lastRun.finishedAt.toISOString() } : null,
    };
  }

  /** Fixes the teams have submitted, waiting for an analyst's check. */
  async fixChecks(): Promise<FixChecksResponse> {
    const flags = await this.dataSource.getRepository(FlagEntity).find({
      where: { status: "fix_submitted" },
      relations: { ownerTeam: true },
      order: { severityRank: "ASC", dueDate: "ASC", id: "ASC" },
    });
    const now = today();
    return { flags: flags.map((flag) => toFlagSummary(flag, now)) };
  }

  /** A lead's team's flags: sent back first, then to fix, waiting for the analyst, recently closed. */
  async queue(user: User): Promise<QueueResponse> {
    if (!user.team) throw new ApiException(403, "forbidden");
    const repository = this.dataSource.getRepository(FlagEntity);
    const open = await repository.find({
      where: {
        ownerTeamId: user.team.id,
        status: In(["confirmed", "being_fixed", "fix_submitted"]),
      },
      relations: { ownerTeam: true },
      order: { severityRank: "ASC", dueDate: "ASC", id: "ASC" },
    });
    const closed = await repository.find({
      where: { ownerTeamId: user.team.id, status: "closed" },
      relations: { ownerTeam: true },
      order: { updatedAt: "DESC", id: "DESC" },
      take: 20,
    });
    const now = today();
    const summaries = open.map((flag) => toFlagSummary(flag, now));
    return {
      team: user.team,
      sentBack: summaries.filter((flag) => flag.sentBack !== null),
      toFix: summaries.filter(
        (flag) =>
          (flag.status === "confirmed" || flag.status === "being_fixed") && flag.sentBack === null,
      ),
      waiting: summaries.filter((flag) => flag.status === "fix_submitted"),
      closed: closed.map((flag) => toFlagSummary(flag, now)),
    };
  }

  /** What each role has waiting: analysts their inbox and fix checks, leads their team's queue. */
  async counts(user: User, notices: number): Promise<CountsResponse> {
    const repository = this.dataSource.getRepository(FlagEntity);
    if (user.role === "analyst") {
      return {
        inbox: await repository.count({ where: { status: "with_analyst" } }),
        fixChecks: await repository.count({ where: { status: "fix_submitted" } }),
        queue: null,
        notices,
      };
    }
    if (user.role === "lead" && user.team) {
      return {
        inbox: null,
        fixChecks: null,
        queue: await repository.count({
          where: { ownerTeamId: user.team.id, status: In(["confirmed", "being_fixed"]) },
        }),
        notices,
      };
    }
    return { inbox: null, fixChecks: null, queue: null, notices };
  }

  async detail(user: User, id: string): Promise<FlagResponse> {
    const flag = await this.dataSource
      .getRepository(FlagEntity)
      .findOne({ where: { id }, relations: { ownerTeam: true } });
    if (!flag || !canRead(guardOf(flag), user)) throw new ApiException(404, "not_found");
    return { flag: await this.toDetail(flag, user) };
  }

  /**
   * One action on a flag, in one transaction: locks the flag and checks the reader may still take
   * the action on the version they saw. `apply` writes the change, its audit events and notices.
   */
  protected async act(
    user: User,
    id: string,
    rowVersion: number,
    action: FlagAction,
    apply: (manager: EntityManager, flag: FlagEntity, now: Date) => Promise<void>,
  ): Promise<FlagResponse> {
    await this.dataSource.transaction(async (manager) => {
      const flag = await manager.findOne(FlagEntity, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      if (!flag || !canRead(guardOf(flag), user)) throw new ApiException(404, "not_found");
      if (flag.rowVersion !== rowVersion) {
        throw new ApiException(409, "flag_changed", {
          status: flag.status,
          by: flag.lastChangedBy ?? "",
        });
      }
      if (!allowedActions(guardOf(flag), user).includes(action)) {
        const ownFix =
          (action === "verify" || action === "send_back") &&
          flag.status === "fix_submitted" &&
          isOwnFix(guardOf(flag), user);
        throw new ApiException(403, ownFix ? "fix_check_own_fix" : "forbidden");
      }
      await apply(manager, flag, new Date());
    });
    return this.detail(user, id);
  }

  /** Sends the flag to its owner team; changes to severity, team or fix need one reason. */
  async confirm(user: User, id: string, body: ConfirmFlagRequest): Promise<FlagResponse> {
    return this.act(user, id, body.rowVersion, "confirm", async (manager, flag, now) => {
      const ownerId = body.ownerTeamId ?? flag.ownerTeamId;
      if (!ownerId) throw new ApiException(400, "flag_owner_required");
      const owner = await manager.findOne(TeamEntity, { where: { id: ownerId } });
      if (!owner) throw new ApiException(400, "team_not_found");
      const changes: FlagChange[] = [];
      // Choosing a team for a flag without one is not a change.
      if (flag.ownerTeamId && flag.ownerTeamId !== owner.id) {
        const previous = await manager.findOne(TeamEntity, { where: { id: flag.ownerTeamId } });
        changes.push({ field: "owner", from: previous?.nameEn ?? null, to: owner.nameEn });
      }
      const severity = body.severity ?? flag.severity;
      if (severity !== flag.severity) {
        changes.push({ field: "severity", from: flag.severity, to: severity });
      }
      const fix = body.suggestedFix;
      const fixChanged =
        fix !== undefined && fix !== flag.suggestedFixEn && fix !== flag.suggestedFixAr;
      if (fix !== undefined && fixChanged) {
        changes.push({ field: "suggested_fix", from: flag.suggestedFixEn, to: fix });
      }
      const reason = body.reason?.trim() ? body.reason.trim() : null;
      if (changes.length > 0 && !reason) {
        throw new ApiException(400, "flag_change_reason_required");
      }
      const decision: FlagDecision = {
        action: "confirm",
        by: user.displayName,
        byId: user.id,
        at: now.toISOString(),
        reason: null,
        note: null,
        changes,
        changeReason: changes.length > 0 ? reason : null,
      };
      const severityReasons: SeverityReason[] =
        severity === flag.severity
          ? flag.severityReasons
          : [
              ...flag.severityReasons,
              { code: "analyst_change", from: flag.severity, to: severity, by: user.displayName },
            ];
      const dueDate =
        severity === flag.severity
          ? flag.dueDate
          : dueDateFor(dubaiDay(flag.createdAt), severity, DEFAULT_FLAG_SETTINGS.dueDays);
      // Who should hear about it follows the severity too, by the band found when it was raised.
      const level = levelFor(severity, flag.reportTo.band, DEFAULT_FLAG_SETTINGS.reportTo);
      const reportTo: ReportTo =
        severity === flag.severity
          ? flag.reportTo
          : {
              ...flag.reportTo,
              level,
              severity,
              personId: namedPerson(
                level,
                flag.reportTo.lineManagerId ?? null,
                flag.reportTo.deptHeadId ?? null,
              ),
            };
      await manager.update(
        FlagEntity,
        { id: flag.id },
        {
          status: "confirmed",
          decision,
          severity,
          severityReasons,
          ownerTeamId: owner.id,
          dueDate,
          reportTo,
          suggestedFixEn: fix !== undefined && fixChanged ? fix : flag.suggestedFixEn,
          suggestedFixAr: fix !== undefined && fixChanged ? fix : flag.suggestedFixAr,
          lastChangedBy: user.displayName,
          rowVersion: flag.rowVersion + 1,
          updatedAt: now,
        },
      );
      if (changes.length > 0) {
        await this.audit.append(
          manager,
          {
            actor: actorOf(user),
            action: "flag.change",
            objectType: "flag",
            objectId: flag.id,
            before: Object.fromEntries(changes.map((change) => [change.field, change.from])),
            after: {
              name: flag.id,
              ...Object.fromEntries(changes.map((change) => [change.field, change.to])),
              reportTo: reportTo.level,
            },
            reason,
          },
          now,
        );
      }
      await this.audit.append(
        manager,
        {
          actor: actorOf(user),
          action: "flag.confirm",
          objectType: "flag",
          objectId: flag.id,
          before: { status: flag.status },
          after: { name: flag.id, status: "confirmed", team: owner.nameEn, severity, dueDate },
        },
        now,
      );
      const leads = await manager.find(UserEntity, {
        where: { role: "lead", teamId: owner.id, isActive: true },
      });
      await this.notices.notify(
        manager,
        leads.map((lead) => lead.id),
        user.id,
        "flag_sent_to_team",
        {
          flagId: flag.id,
          ruleId: flag.ruleId,
          ruleTitle: flag.ruleTitle,
          severity,
          team: owner.nameEn,
          by: user.displayName,
        },
      );
    });
  }

  /** Closes the flag as not a problem: a reason allowed for its kind, and a note for the record. */
  async dismiss(user: User, id: string, body: DismissFlagRequest): Promise<FlagResponse> {
    return this.act(user, id, body.rowVersion, "dismiss", async (manager, flag, now) => {
      if (!DISMISS_REASONS_FOR[flag.kind].includes(body.reason)) {
        throw new ApiException(400, "dismiss_reason_not_allowed");
      }
      const decision: FlagDecision = {
        action: "dismiss",
        by: user.displayName,
        byId: user.id,
        at: now.toISOString(),
        reason: body.reason,
        note: body.note,
        changes: [],
        changeReason: null,
      };
      await manager.update(
        FlagEntity,
        { id: flag.id },
        {
          status: "dismissed",
          decision,
          lastChangedBy: user.displayName,
          rowVersion: flag.rowVersion + 1,
          updatedAt: now,
        },
      );
      await this.audit.append(
        manager,
        {
          actor: actorOf(user),
          action: "flag.dismiss",
          objectType: "flag",
          objectId: flag.id,
          before: { status: flag.status },
          after: { name: flag.id, status: "dismissed", dismissReason: body.reason },
          reason: body.note,
        },
        now,
      );
    });
  }

  /** The team lead starts the fix, or hands it to someone else in the team. */
  async assign(user: User, id: string, body: AssignFlagRequest): Promise<FlagResponse> {
    return this.act(user, id, body.rowVersion, "assign", async (manager, flag, now) => {
      const assignee = flag.ownerTeamId
        ? await manager.findOne(UserEntity, {
            where: { id: body.assigneeId, teamId: flag.ownerTeamId, isActive: true },
          })
        : null;
      if (!assignee) throw new ApiException(400, "assignee_not_in_team");
      const assignment: FlagAssignment = {
        assigneeId: assignee.id,
        assignee: assignee.displayName,
        by: user.displayName,
        byId: user.id,
        at: now.toISOString(),
      };
      await manager.update(
        FlagEntity,
        { id: flag.id },
        {
          status: "being_fixed",
          assigneeId: assignee.id,
          assignment,
          lastChangedBy: user.displayName,
          rowVersion: flag.rowVersion + 1,
          updatedAt: now,
        },
      );
      await this.audit.append(
        manager,
        {
          actor: actorOf(user),
          action: "flag.assign",
          objectType: "flag",
          objectId: flag.id,
          before: { status: flag.status, assignee: flag.assignment?.assignee ?? null },
          after: { name: flag.id, status: "being_fixed", assignee: assignee.displayName },
        },
        now,
      );
      await this.notices.notify(manager, [assignee.id], user.id, "flag_assigned", {
        flagId: flag.id,
        ruleId: flag.ruleId,
        ruleTitle: flag.ruleTitle,
        by: user.displayName,
      });
    });
  }

  /** The team records what it did in the source system; an analyst checks it next. */
  async fix(user: User, id: string, body: FixFlagRequest): Promise<FlagResponse> {
    return this.act(user, id, body.rowVersion, "fix", async (manager, flag, now) => {
      const fix: FlagFix = {
        type: body.fixType,
        note: body.note,
        by: user.displayName,
        byId: user.id,
        at: now.toISOString(),
      };
      await manager.update(
        FlagEntity,
        { id: flag.id },
        {
          status: "fix_submitted",
          fix,
          lastChangedBy: user.displayName,
          rowVersion: flag.rowVersion + 1,
          updatedAt: now,
        },
      );
      await this.audit.append(
        manager,
        {
          actor: actorOf(user),
          action: "flag.fix_submit",
          objectType: "flag",
          objectId: flag.id,
          before: { status: flag.status },
          after: { name: flag.id, status: "fix_submitted", fixType: body.fixType },
          reason: body.note,
        },
        now,
      );
      await this.notices.notify(manager, [flag.decision?.byId], user.id, "flag_fix_submitted", {
        flagId: flag.id,
        ruleId: flag.ruleId,
        ruleTitle: flag.ruleTitle,
        fixType: body.fixType,
        by: user.displayName,
      });
    });
  }

  /** The fix is right: closed. Never by whoever was given the fix or submitted it. */
  async verify(user: User, id: string, body: VerifyFlagRequest): Promise<FlagResponse> {
    return this.act(user, id, body.rowVersion, "verify", async (manager, flag, now) => {
      const verification: FlagVerification = {
        by: user.displayName,
        byId: user.id,
        at: now.toISOString(),
      };
      await manager.update(
        FlagEntity,
        { id: flag.id },
        {
          status: "closed",
          verification,
          lastChangedBy: user.displayName,
          rowVersion: flag.rowVersion + 1,
          updatedAt: now,
        },
      );
      await this.audit.append(
        manager,
        {
          actor: actorOf(user),
          action: "flag.verify",
          objectType: "flag",
          objectId: flag.id,
          before: { status: flag.status },
          after: { name: flag.id, status: "closed" },
        },
        now,
      );
      await this.notices.notify(
        manager,
        [flag.assigneeId, flag.fix?.byId],
        user.id,
        "flag_closed",
        {
          flagId: flag.id,
          ruleId: flag.ruleId,
          ruleTitle: flag.ruleTitle,
          by: user.displayName,
        },
      );
    });
  }

  /** Not fixed: back to the team with what is still wrong. */
  async sendBack(user: User, id: string, body: SendBackFlagRequest): Promise<FlagResponse> {
    return this.act(user, id, body.rowVersion, "send_back", async (manager, flag, now) => {
      const sentBack: FlagSentBack = {
        reason: body.reason,
        by: user.displayName,
        byId: user.id,
        at: now.toISOString(),
      };
      await manager.update(
        FlagEntity,
        { id: flag.id },
        {
          status: "being_fixed",
          sentBack,
          lastChangedBy: user.displayName,
          rowVersion: flag.rowVersion + 1,
          updatedAt: now,
        },
      );
      await this.audit.append(
        manager,
        {
          actor: actorOf(user),
          action: "flag.send_back",
          objectType: "flag",
          objectId: flag.id,
          before: { status: flag.status },
          after: { name: flag.id, status: "being_fixed" },
          reason: body.reason,
        },
        now,
      );
      await this.notices.notify(
        manager,
        [flag.assigneeId, flag.fix?.byId],
        user.id,
        "flag_sent_back",
        {
          flagId: flag.id,
          ruleId: flag.ruleId,
          ruleTitle: flag.ruleTitle,
          reason: body.reason,
          by: user.displayName,
        },
      );
    });
  }

  /** Everything the flag's page shows, as this reader may see it. */
  protected async toDetail(flag: FlagEntity, user: User): Promise<FlagDetail> {
    const manager = this.dataSource.manager;
    const version = await manager.findOne(RuleVersionEntity, {
      where: { ruleId: flag.ruleId, version: flag.ruleVersion },
    });
    const others = flag.transactionIds.length
      ? await manager
          .getRepository(FlagEntity)
          .createQueryBuilder("flag")
          .where("flag.transactionIds && :ids", { ids: flag.transactionIds })
          .andWhere("flag.id <> :id", { id: flag.id })
          .orderBy("flag.id", "ASC")
          .getMany()
      : [];
    const { events } = await this.audit.list({ objectId: flag.id, limit: 200 });
    const allowed = allowedActions(guardOf(flag), user);
    const assignees =
      allowed.includes("assign") && flag.ownerTeamId
        ? await manager.find(UserEntity, {
            where: { teamId: flag.ownerTeamId, isActive: true },
            order: { displayName: "ASC" },
          })
        : [];
    const teams = allowed.includes("confirm")
      ? await manager.find(TeamEntity, { order: { nameEn: "ASC" } })
      : [];
    return toFlagDetail(flag, today(), {
      ruleText: version?.sourceText ?? "",
      restatementEn: version?.restatementEn ?? null,
      restatementAr: version?.restatementAr ?? null,
      related: others
        .filter((other) => canRead(guardOf(other), user))
        .map((other) => ({
          id: other.id,
          ruleId: other.ruleId,
          ruleTitle: other.ruleTitle,
          status: other.status,
        })),
      timeline: events.filter((event) => event.objectType === "flag").reverse(),
      allowed,
      assignees: assignees.map((person) => ({ id: person.id, displayName: person.displayName })),
      teams: teams.map(toTeamSummary),
    });
  }
}
