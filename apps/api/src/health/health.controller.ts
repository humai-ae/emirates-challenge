import type { HealthResponse } from "@hrcc/shared";
import { Controller, Get, Res } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { Response } from "express";
import { DataSource } from "typeorm";
import { Public } from "../common/public.decorator.js";

@Controller("health")
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Public()
  @Get()
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const db = await this.dataSource.query("SELECT 1").then(
      () => "ok" as const,
      () => "down" as const,
    );
    if (db === "down") response.status(503);
    return { status: db === "ok" ? "ok" : "degraded", db, ai: "not_configured" };
  }
}
