import { createHash, timingSafeEqual } from "node:crypto";
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { AI_ENV, type AiEnv } from "../config/env.js";

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Only apps/api holds the token; the service is never exposed publicly. */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(@Inject(AI_ENV) env: AiEnv) {
    this.expected = digest(env.AI_SERVICE_TOKEN);
  }

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<Request>().get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    if (token.length === 0 || !timingSafeEqual(digest(token), this.expected)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
