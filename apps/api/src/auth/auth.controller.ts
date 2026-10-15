import {
  type LoginRequest,
  LoginRequestSchema,
  type MeResponse,
  SESSION_COOKIE,
  type User,
} from "@hrcc/shared";
import { Body, Controller, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { Request, Response } from "express";
import { DataSource } from "typeorm";
import { actorOf } from "../audit/actor.js";
import { AuditService } from "../audit/audit.service.js";
import { AllowDuringPasswordChange } from "../common/allow-during-password-change.decorator.js";
import { ApiException } from "../common/api-exception.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { Public } from "../common/public.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { ENV, type Env } from "../config/env.js";
import { burnVerification, verifyPassword } from "./password.js";
import { readSessionToken, SessionService } from "./session.service.js";
import { toUserDto, UsersService } from "./users.service.js";

@Controller("auth")
export class AuthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** One answer for a wrong email, a wrong password and a deactivated account. */
  @Public()
  @Post("login")
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) body: LoginRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MeResponse> {
    if (this.env.AUTH_MODE !== "password") throw new ApiException(403, "password_auth_disabled");
    const entity = await this.users.findByEmail(body.email);
    let valid = false;
    if (entity?.passwordHash) valid = await verifyPassword(body.password, entity.passwordHash);
    else await burnVerification(body.password);
    if (!entity || !valid || !entity.isActive) throw new ApiException(401, "invalid_credentials");
    const user = toUserDto(entity);
    const previous = readSessionToken(request);
    const session = await this.dataSource.transaction(async (manager) => {
      if (previous) await this.sessions.destroy(manager, previous);
      const created = await this.sessions.create(manager, user.id);
      await this.audit.append(manager, {
        actor: actorOf(user),
        action: "auth.sign_in",
        objectType: "user",
        objectId: user.id,
        after: { method: "password" },
      });
      return created;
    });
    response.cookie(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.env.COOKIE_SECURE,
      path: "/",
      expires: session.expiresAt,
    });
    return { user };
  }

  @AllowDuringPasswordChange()
  @Post("logout")
  @HttpCode(204)
  async logout(
    @CurrentUser() user: User,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = readSessionToken(request);
    await this.dataSource.transaction(async (manager) => {
      if (token) await this.sessions.destroy(manager, token);
      await this.audit.append(manager, {
        actor: actorOf(user),
        action: "auth.sign_out",
        objectType: "user",
        objectId: user.id,
      });
    });
    response.clearCookie(SESSION_COOKIE, { path: "/" });
  }
}
