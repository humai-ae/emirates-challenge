import type { TeamRequest, TeamResponse, User } from "@hrcc/shared";
import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, type EntityManager } from "typeorm";
import { actorOf } from "../audit/actor.js";
import { AuditService } from "../audit/audit.service.js";
import { toTeamSummary } from "../auth/users.service.js";
import { ApiException } from "../common/api-exception.js";
import { TeamEntity } from "../database/entities/index.js";

/** Serialises everything that names teams (pg_advisory_xact_lock key); routing saves take it too. */
export const TEAM_NAMES_LOCK_KEY = 482_063;

/** A team name another team already has, whatever its case, is refused. */
export async function refuseTakenName(
  manager: EntityManager,
  name: string,
  id: string | null,
): Promise<void> {
  const rows: unknown[] = await manager.query(
    "SELECT 1 FROM teams WHERE lower(name_en) = lower($1) AND ($2::uuid IS NULL OR id <> $2::uuid)",
    [name, id],
  );
  if (rows.length > 0) throw new ApiException(409, "team_name_taken");
}

@Injectable()
export class TeamsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async create(admin: User, body: TeamRequest): Promise<TeamResponse> {
    const team = await this.dataSource.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock($1)", [TEAM_NAMES_LOCK_KEY]);
      await refuseTakenName(manager, body.nameEn, null);
      const created = await manager.save(
        TeamEntity,
        manager.create(TeamEntity, { nameEn: body.nameEn, nameAr: body.nameAr || null }),
      );
      await this.audit.append(manager, {
        actor: actorOf(admin),
        action: "team.create",
        objectType: "team",
        objectId: created.id,
        after: { name: created.nameEn, nameAr: created.nameAr },
      });
      return created;
    });
    return { team: toTeamSummary(team) };
  }

  /** Renames a team; the last save wins. */
  async update(admin: User, id: string, body: TeamRequest): Promise<TeamResponse> {
    const team = await this.dataSource.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock($1)", [TEAM_NAMES_LOCK_KEY]);
      const current = await manager.findOneBy(TeamEntity, { id });
      if (!current) throw new ApiException(404, "not_found");
      await refuseTakenName(manager, body.nameEn, id);
      const before = { name: current.nameEn, nameAr: current.nameAr };
      current.nameEn = body.nameEn;
      current.nameAr = body.nameAr || null;
      await manager.save(TeamEntity, current);
      await this.audit.append(manager, {
        actor: actorOf(admin),
        action: "team.update",
        objectType: "team",
        objectId: id,
        before,
        after: { name: current.nameEn, nameAr: current.nameAr },
      });
      return current;
    });
    return { team: toTeamSummary(team) };
  }
}
