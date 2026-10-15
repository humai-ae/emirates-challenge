import {
  type ChangePasswordRequest,
  ChangePasswordRequestSchema,
  type MeResponse,
  type UpdatePreferencesRequest,
  UpdatePreferencesRequestSchema,
  type User,
} from "@hrcc/shared";
import { Body, Controller, Get, HttpCode, Patch, Post, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { Request } from "express";
import { DataSource } from "typeorm";
import { actorOf } from "../audit/actor.js";
import { AuditService } from "../audit/audit.service.js";
import { AllowDuringPasswordChange } from "../common/allow-during-password-change.decorator.js";
import { ApiException } from "../common/api-exception.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { UserEntity } from "../database/entities/index.js";
import { hashPassword, verifyPassword } from "./password.js";
import { readSessionToken, SessionService } from "./session.service.js";
import { toUserDto } from "./users.service.js";

@Controller("me")
export class MeController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  @AllowDuringPasswordChange()
  @Get()
  me(@CurrentUser() user: User): MeResponse {
    return { user };
  }

  @AllowDuringPasswordChange()
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

  /** Also how a required change is completed. Other sessions end; this one stays. */
  @AllowDuringPasswordChange()
  @Post("password")
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(ChangePasswordRequestSchema)) body: ChangePasswordRequest,
    @Req() request: Request,
  ): Promise<MeResponse> {
    const { passwordHash } = await this.dataSource
      .getRepository(UserEntity)
      .findOneByOrFail({ id: user.id });
    if (!passwordHash || !(await verifyPassword(body.currentPassword, passwordHash))) {
      throw new ApiException(400, "wrong_password");
    }
    if (await verifyPassword(body.newPassword, passwordHash)) {
      throw new ApiException(400, "password_unchanged");
    }
    const newHash = await hashPassword(body.newPassword);
    const updated = await this.dataSource.transaction(async (manager) => {
      await manager.update(
        UserEntity,
        { id: user.id },
        { passwordHash: newHash, mustChangePassword: false },
      );
      await this.sessions.destroyAllForUser(manager, user.id, readSessionToken(request));
      await this.audit.append(manager, {
        actor: actorOf(user),
        action: "auth.password_change",
        objectType: "user",
        objectId: user.id,
      });
      return manager.findOneOrFail(UserEntity, {
        where: { id: user.id },
        relations: { team: true },
      });
    });
    return { user: toUserDto(updated) };
  }
}
