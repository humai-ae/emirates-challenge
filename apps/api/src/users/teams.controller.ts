import {
  type TeamRequest,
  TeamRequestSchema,
  type TeamResponse,
  type TeamsListResponse,
  type User,
} from "@hrcc/shared";
import { Body, Controller, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { z } from "zod";
import { toTeamSummary } from "../auth/users.service.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { Roles } from "../common/roles.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { TeamEntity } from "../database/entities/index.js";
import { TeamsService } from "./teams.service.js";

/** Teams: for the Users form, routing, and their own list. */
@Controller("teams")
@Roles("admin")
export class TeamsController {
  constructor(
    @InjectRepository(TeamEntity) private readonly teams: Repository<TeamEntity>,
    private readonly service: TeamsService,
  ) {}

  @Get()
  async list(): Promise<TeamsListResponse> {
    const teams = await this.teams.find({ order: { nameEn: "ASC" } });
    return { teams: teams.map(toTeamSummary) };
  }

  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() admin: User,
    @Body(new ZodValidationPipe(TeamRequestSchema)) body: TeamRequest,
  ): Promise<TeamResponse> {
    return this.service.create(admin, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() admin: User,
    @Param("id", new ZodValidationPipe(z.uuid())) id: string,
    @Body(new ZodValidationPipe(TeamRequestSchema)) body: TeamRequest,
  ): Promise<TeamResponse> {
    return this.service.update(admin, id, body);
  }
}
