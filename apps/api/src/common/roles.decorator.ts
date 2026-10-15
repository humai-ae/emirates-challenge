import type { Role } from "@hrcc/shared";
import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "hrcc:roles";

export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
