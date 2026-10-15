import { z } from "zod";

export const ROLES = ["admin", "analyst", "lead", "auditor"] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;
