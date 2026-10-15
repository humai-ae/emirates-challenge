import {
  type MeResponse,
  type UpdatePreferencesRequest,
  UpdatePreferencesRequestSchema,
  type User,
} from "@hrcc/shared";
import { Body, Controller, Get, Patch } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { actorOf } from "../audit/actor.js";
import { AuditService } from "../audit/audit.service.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { UserEntity } from "../database/entities/index.js";
import { toUserDto } from "./users.service.js";

@Controller("me")
export class MeController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  @Get()
  me(@CurrentUser() user: User): MeResponse {
    return { user };
  }

  @Patch("preferences")
  async updatePreferences(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(UpdatePreferencesRequestSchema)) body: UpdatePreferencesRequest,
  ): Promise<MeResponse> {
    if (body.locale === user.locale) return { user };
    const updated = await this.dataSource.transaction(async (manager) => {
      await manager.update(UserEntity, { id: user.id }, { locale: body.locale });
      await this.audit.append(manager, {
        actor: actorOf(user),
        action: "user.preferences_update",
        objectType: "user",
        objectId: user.id,
        before: { locale: user.locale },
        after: { locale: body.locale },
      });
      return manager.findOneOrFail(UserEntity, {
        where: { id: user.id },
        relations: { team: true },
      });
    });
    return { user: toUserDto(updated) };
  }
}
