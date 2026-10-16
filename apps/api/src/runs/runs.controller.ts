import {
  type RunResponse,
  type RunsListResponse,
  type StartRunRequest,
  StartRunRequestSchema,
  type User,
} from "@hrcc/shared";
import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../common/current-user.decorator.js";
import { Roles } from "../common/roles.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { RunsService } from "./runs.service.js";

export const RunIdPipe = new ZodValidationPipe(z.string().regex(/^RUN-\d{4}-\d{2}-\d{2}-\d{2,}$/));

@Controller("runs")
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Post()
  @Roles("admin", "analyst")
  @HttpCode(201)
  start(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(StartRunRequestSchema)) _body: StartRunRequest,
  ): Promise<RunResponse> {
    return this.runs.start(user);
  }

  @Get()
  @Roles("admin", "analyst", "auditor")
  list(): Promise<RunsListResponse> {
    return this.runs.list();
  }

  @Get(":id")
  @Roles("admin", "analyst", "auditor")
  detail(@Param("id", RunIdPipe) id: string): Promise<RunResponse> {
    return this.runs.detail(id);
  }
}
