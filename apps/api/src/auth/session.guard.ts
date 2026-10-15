import { SESSION_COOKIE } from "@hrcc/shared";
import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Response } from "express";
import { ApiException } from "../common/api-exception.js";
import type { RequestWithUser } from "../common/current-user.decorator.js";
import { IS_PUBLIC_KEY } from "../common/public.decorator.js";
import { readSessionToken, SessionService } from "./session.service.js";
import { toUserDto } from "./users.service.js";

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithUser>();
    const token = readSessionToken(request);
    const user = token ? await this.sessions.resolve(token) : null;
    if (!user) {
      http.getResponse<Response>().clearCookie(SESSION_COOKIE, { path: "/" });
      throw new ApiException(401, "unauthenticated");
    }
    request.user = toUserDto(user);
    return true;
  }
}
