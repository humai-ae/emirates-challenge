import { dubaiDay } from "@hrcc/engine";
import type {
  FixChecksResponse,
  FlagDetail,
  FlagKind,
  FlagResponse,
  InboxQuery,
  InboxResponse,
  QueueResponse,
  Severity,
  User,
} from "@hrcc/shared";
import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, In } from "typeorm";
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
import { toFlagDetail, toFlagSummary } from "./flag-dto.js";
import { allowedActions, canRead, guardOf } from "./flag-rules.js";

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

  async detail(user: User, id: string): Promise<FlagResponse> {
    const flag = await this.dataSource
      .getRepository(FlagEntity)
      .findOne({ where: { id }, relations: { ownerTeam: true } });
    if (!flag || !canRead(guardOf(flag), user)) throw new ApiException(404, "not_found");
    return { flag: await this.toDetail(flag, user) };
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
