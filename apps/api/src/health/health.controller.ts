import type { HealthResponse } from "@hrcc/shared";
import { Controller, Get, Res } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { Response } from "express";
import { DataSource } from "typeorm";
import { AiClient } from "../ai/ai-client.service.js";
import { Public } from "../common/public.decorator.js";

@Controller("health")
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ai: AiClient,
  ) {}

  /** For a container's liveness probe: the process answers. Never touches the database. */
  @Public()
  @Get("live")
  live(): { status: "ok" } {
    return { status: "ok" };
  }

  /** Readiness: 503 while the database is unreachable. */
  @Public()
  @Get()
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const [db, ai] = await Promise.all([
      this.dataSource.query("SELECT 1").then(
        () => "ok" as const,
        () => "down" as const,
      ),
      this.ai.health(),
    ]);
    if (db === "down") response.status(503);
    const status = db === "ok" && ai !== "unreachable" ? "ok" : "degraded";
    return { status, db, ai };
  }
}
