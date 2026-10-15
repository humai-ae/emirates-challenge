import type { User } from "@hrcc/shared";
import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { ApiException } from "./api-exception.js";

export type RequestWithUser = Request & { user?: User };

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): User => {
    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user) throw new ApiException(401, "unauthenticated");
    return user;
  },
);
