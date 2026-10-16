import type {
  AiRoutingRequest,
  OwnerEntry,
  RoutingProposal,
  RoutingResponse,
  SaveRoutingRequest,
  User,
} from "@hrcc/shared";
import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";
import { AiClient } from "../ai/ai-client.service.js";
import { AiFailed, AiNotConfigured } from "../ai/ai-errors.js";
import { actorOf } from "../audit/actor.js";
import { AuditService } from "../audit/audit.service.js";
import { toTeamSummary } from "../auth/users.service.js";
import { ApiException } from "../common/api-exception.js";
import { PolicyUploadEntity, RoutingRuleEntity, TeamEntity } from "../database/entities/index.js";
import { CheckDatasetsService } from "../rules/check-datasets.service.js";
import { TEAM_NAMES_LOCK_KEY } from "../users/teams.service.js";

/** Teams AI may propose besides the policy's and those that exist: common HR operations teams. */
export const STANDARD_TEAMS = [
  "Payroll & Compensation",
  "Talent Acquisition",
  "Employee Services",
  "Employee Relations",
  "Leave & Attendance",
  "Exits & Offboarding",
  "HR Operations",
];
/** Serialises routing saves (pg_advisory_xact_lock key). */
const ROUTING_LOCK_KEY = 482_061;
/** The longest transaction type and team name the AI request carries. */
const MAX_TYPE = 64;
const MAX_TEAM = 80;
/** AI proposals less certain than this are left for the admin. */
const MIN_AI_PROBABILITY = 0.5;

/** The first spelling of each name, whatever its case. */
function uniqueNames(names: readonly string[]): string[] {
  const seen = new Map<string, string>();
  for (const name of names) if (!seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  return [...seen.values()];
}

/** What AI may be asked: types and team names short enough for its contract, each team once. */
export function routingRequest(
  types: readonly string[],
  teams: readonly string[],
): AiRoutingRequest | null {
  const sendable = types.filter((type) => type.length > 0 && type.length <= MAX_TYPE).slice(0, 50);
  const names = uniqueNames(
    teams.filter((team) => team.length > 0 && team.length <= MAX_TEAM),
  ).slice(0, 40);
  return sendable.length > 0 && names.length > 0 ? { types: sendable, teams: names } : null;
}

@Injectable()
export class RoutingService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly datasets: CheckDatasetsService,
    private readonly ai: AiClient,
    private readonly audit: AuditService,
  ) {}

  /** The newest dataset's types, then any other type already routed, with their teams. */
  async get(): Promise<RoutingResponse> {
    const [rows, dataset, policyOwners] = await Promise.all([
      this.dataSource
        .getRepository(RoutingRuleEntity)
        .find({ relations: { team: true, setBy: true } }),
      this.datasets.latest(),
      this.policyOwners(),
    ]);
    const types = dataset?.info.vocabulary.types ?? [];
    const byType = new Map(rows.map((row) => [row.transactionType, row]));
    const others = rows
      .map((row) => row.transactionType)
      .filter((type) => !types.includes(type))
      .sort();
    return {
      rows: [...types, ...others].map((type) => {
        const row = byType.get(type);
        return {
          type,
          team: row ? toTeamSummary(row.team) : null,
          setBy: row?.setBy.displayName ?? null,
          setAt: row?.setAt.toISOString() ?? null,
        };
      }),
      policyOwners,
    };
  }

  /** Owners for the data's types: the policy's own table first, then AI for the rest. Nothing is saved. */
  async propose(): Promise<RoutingProposal> {
    const dataset = await this.datasets.latest();
    if (!dataset) throw new ApiException(409, "no_dataset");
    const types = dataset.info.vocabulary.types;
    const fromPolicy = new Map(
      (await this.policyOwners())
        .filter((entry) => types.includes(entry.type))
        .map((entry) => [entry.type, entry.team]),
    );
    const rest = types.filter((type) => !fromPolicy.has(type));
    const fromAi = new Map<string, { team: string; probability: number }>();
    const existing =
      rest.length > 0
        ? await this.dataSource.getRepository(TeamEntity).find({ order: { nameEn: "ASC" } })
        : [];
    const asked = routingRequest(rest, [
      ...fromPolicy.values(),
      ...existing.map((team) => team.nameEn),
      ...STANDARD_TEAMS,
    ]);
    if (asked) {
      try {
        const answer = await this.ai.proposeRouting(asked);
        for (const owner of answer.owners) {
          if (owner.team && owner.probability >= MIN_AI_PROBABILITY) {
            fromAi.set(owner.type, { team: owner.team, probability: owner.probability });
          }
        }
      } catch (error) {
        if (!(error instanceof AiNotConfigured) && !(error instanceof AiFailed)) throw error;
      }
    }
    const proposals: RoutingProposal["proposals"] = [];
    for (const type of types) {
      const policy = fromPolicy.get(type);
      const ai = fromAi.get(type);
      if (policy) proposals.push({ type, team: policy, source: "policy", confidence: null });
      else if (ai)
        proposals.push({ type, team: ai.team, source: "ai", confidence: ai.probability });
    }
    const proposed = new Set(proposals.map((proposal) => proposal.type));
    return { proposals, unassigned: types.filter((type) => !proposed.has(type)) };
  }

  /**
   * Sets the rows given; a null team clears a row and types left out stay as they are. A team
   * name matches an existing team whatever its case, or creates one.
   */
  async save(admin: User, body: SaveRoutingRequest): Promise<RoutingResponse> {
    const dataset = await this.datasets.latest();
    await this.dataSource.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock($1)", [ROUTING_LOCK_KEY]);
      await manager.query("SELECT pg_advisory_xact_lock($1)", [TEAM_NAMES_LOCK_KEY]);
      const current = await manager.find(RoutingRuleEntity, { relations: { team: true } });
      const allowed = new Set([
        ...(dataset?.info.vocabulary.types ?? []),
        ...current.map((row) => row.transactionType),
      ]);
      const unknown = body.rows.find((row) => !allowed.has(row.type));
      if (unknown) throw new ApiException(400, "routing_type_unknown", { type: unknown.type });
      const byName = new Map(
        (await manager.find(TeamEntity)).map((team) => [team.nameEn.toLowerCase(), team]),
      );
      const byType = new Map(current.map((row) => [row.transactionType, row]));
      const createdTeams: string[] = [];
      const now = new Date();
      for (const row of body.rows) {
        if (row.teamName === null) {
          await manager.delete(RoutingRuleEntity, { transactionType: row.type });
          continue;
        }
        let team = byName.get(row.teamName.toLowerCase());
        if (!team) {
          team = await manager.save(
            TeamEntity,
            manager.create(TeamEntity, { nameEn: row.teamName, nameAr: null }),
          );
          byName.set(team.nameEn.toLowerCase(), team);
          createdTeams.push(team.nameEn);
        }
        if (byType.get(row.type)?.teamId === team.id) continue;
        await manager.upsert(
          RoutingRuleEntity,
          { transactionType: row.type, teamId: team.id, setById: admin.id, setAt: now },
          ["transactionType"],
        );
      }
      const after = await manager.find(RoutingRuleEntity, { relations: { team: true } });
      await this.audit.append(manager, {
        actor: actorOf(admin),
        action: "routing.edit",
        objectType: "routing",
        objectId: "routing",
        before: Object.fromEntries(current.map((row) => [row.transactionType, row.team.nameEn])),
        after: {
          routing: Object.fromEntries(after.map((row) => [row.transactionType, row.team.nameEn])),
          createdTeams,
        },
      });
    });
    return this.get();
  }

  private async policyOwners(): Promise<OwnerEntry[]> {
    const [upload] = await this.dataSource
      .getRepository(PolicyUploadEntity)
      .find({ order: { createdAt: "DESC", id: "ASC" }, take: 1 });
    return upload?.ownerTable ?? [];
  }
}
