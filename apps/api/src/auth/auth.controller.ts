import {
  type DemoLoginRequest,
  DemoLoginRequestSchema,
  type DemoUsersResponse,
  type MeResponse,
  SESSION_COOKIE,
  type User,
} from "@hrcc/shared";
import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { Request, Response } from "express";
import { DataSource } from "typeorm";
import { actorOf } from "../audit/actor.js";
import { AuditService } from "../audit/audit.service.js";
import { ApiException } from "../common/api-exception.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { Public } from "../common/public.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { ENV, type Env } from "../config/env.js";
import { SessionService } from "./session.service.js";
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

  @Public()
  @Get("demo-users")
  async demoUsers(): Promise<DemoUsersResponse> {
    this.assertDemoMode();
    return { users: await this.users.listDemoUsers() };
  }

  @Public()
  @Post("demo-login")
  @HttpCode(200)
  async demoLogin(
    @Body(new ZodValidationPipe(DemoLoginRequestSchema)) body: DemoLoginRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MeResponse> {
    this.assertDemoMode();
    const entity = await this.users.findDemoUser(body.userId);
    if (!entity) throw new ApiException(404, "not_found", { userId: body.userId });
    const user = toUserDto(entity);
    const session = await this.dataSource.transaction(async (manager) => {
      const created = await this.sessions.create(manager, user.id);
      await this.audit.append(manager, {
        actor: actorOf(user),
        action: "auth.sign_in",
        objectType: "user",
        objectId: user.id,
        after: { method: "demo" },
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

  @Post("logout")
  @HttpCode(204)
  async logout(
    @CurrentUser() user: User,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = String(request.cookies?.[SESSION_COOKIE] ?? "");
    await this.dataSource.transaction(async (manager) => {
      await this.sessions.destroy(manager, token);
      await this.audit.append(manager, {
        actor: actorOf(user),
        action: "auth.sign_out",
        objectType: "user",
        objectId: user.id,
      });
    });
    response.clearCookie(SESSION_COOKIE, { path: "/" });
  }

  private assertDemoMode(): void {
    if (this.env.AUTH_MODE !== "demo") throw new ApiException(403, "demo_auth_disabled");
  }
}
