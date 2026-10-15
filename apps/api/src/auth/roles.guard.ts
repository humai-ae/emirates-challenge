import type { Role } from "@hrcc/shared";
import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ApiException } from "../common/api-exception.js";
import type { RequestWithUser } from "../common/current-user.decorator.js";
import { ROLES_KEY } from "../common/roles.decorator.js";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user || !roles.includes(user.role)) throw new ApiException(403, "forbidden");
    return true;
  }
}
