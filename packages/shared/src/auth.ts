import { z } from "zod";
import { LocaleSchema } from "./locales.js";
import { RoleSchema } from "./roles.js";
import { TeamSummarySchema, UserSchema } from "./users.js";

export const CSRF_HEADER = "x-hrcc-request";
export const SESSION_COOKIE = "hrcc_session";

export const DemoUserSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  role: RoleSchema,
  team: TeamSummarySchema.nullable(),
});
export type DemoUser = z.infer<typeof DemoUserSchema>;

export const DemoUsersResponseSchema = z.object({ users: z.array(DemoUserSchema) });
export type DemoUsersResponse = z.infer<typeof DemoUsersResponseSchema>;

export const DemoLoginRequestSchema = z.strictObject({ userId: z.uuid() });
export type DemoLoginRequest = z.infer<typeof DemoLoginRequestSchema>;

export const UpdatePreferencesRequestSchema = z.strictObject({ locale: LocaleSchema });
export type UpdatePreferencesRequest = z.infer<typeof UpdatePreferencesRequestSchema>;

export const MeResponseSchema = z.object({ user: UserSchema });
export type MeResponse = z.infer<typeof MeResponseSchema>;
