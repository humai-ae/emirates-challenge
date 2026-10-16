import {
  type RunResponse,
  type RunResultsQuery,
  RunResultsQuerySchema,
  type RunResultsResponse,
  type RunsListResponse,
  type StartRunRequest,
  StartRunRequestSchema,
  type User,
} from "@hrcc/shared";
import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
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

  @Get(":id/results")
  @Roles("admin", "analyst", "auditor")
  results(
    @Param("id", RunIdPipe) id: string,
    @Query(new ZodValidationPipe(RunResultsQuerySchema)) query: RunResultsQuery,
  ): Promise<RunResultsResponse> {
    return this.runs.results(id, query);
  }

  @Get(":id/export")
  @Roles("admin", "auditor")
  async export(
    @CurrentUser() user: User,
    @Param("id", RunIdPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const { filename, csv } = await this.runs.export(id, user);
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return csv;
  }
}
