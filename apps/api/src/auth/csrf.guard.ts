import { CSRF_HEADER } from "@hrcc/shared";
import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { ApiException } from "../common/api-exception.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * A custom header cannot be sent cross-site without a CORS preflight, which this API never allows.
 * Together with SameSite cookies this blocks cross-site form posts.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method) || request.get(CSRF_HEADER) === "1") return true;
    throw new ApiException(403, "csrf_missing");
  }
}
