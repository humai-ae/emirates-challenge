import {
  type AuditListQuery,
  AuditListQuerySchema,
  type AuditListResponse,
  type IntegrityResult,
  type User,
} from "@hrcc/shared";
import { Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { CurrentUser } from "../common/current-user.decorator.js";
import { Roles } from "../common/roles.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { actorOf } from "./actor.js";
import { AuditService } from "./audit.service.js";

@Controller("audit")
@Roles("admin", "auditor")
export class AuditController {
  constructor(
    private readonly audit: AuditService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(AuditListQuerySchema)) query: AuditListQuery,
  ): Promise<AuditListResponse> {
    return this.audit.list(query);
  }

  @Post("integrity-check")
  @HttpCode(200)
  async integrityCheck(@CurrentUser() user: User): Promise<IntegrityResult> {
    const result = await this.audit.verifyChain();
    const checkedAt = new Date().toISOString();
    await this.dataSource.transaction((manager) =>
      this.audit.append(manager, {
        actor: actorOf(user),
        action: "audit.integrity_check",
        objectType: "audit_log",
        objectId: "audit_events",
        after: result.ok
          ? { ok: true, count: result.count }
          : { ok: false, brokenAt: result.brokenAt },
      }),
    );
    return { ...result, checkedAt };
  }
}
