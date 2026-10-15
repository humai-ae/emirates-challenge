import type { TeamsListResponse } from "@hrcc/shared";
import { Controller, Get } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { toTeamSummary } from "../auth/users.service.js";
import { Roles } from "../common/roles.decorator.js";
import { TeamEntity } from "../database/entities/index.js";

/** Teams for the Users form. */
@Controller("teams")
@Roles("admin")
export class TeamsController {
  constructor(@InjectRepository(TeamEntity) private readonly teams: Repository<TeamEntity>) {}

  @Get()
  async list(): Promise<TeamsListResponse> {
    const teams = await this.teams.find({ order: { nameEn: "ASC" } });
    return { teams: teams.map(toTeamSummary) };
  }
}
