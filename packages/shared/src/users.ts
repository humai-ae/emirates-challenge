import { z } from "zod";
import { EmailSchema, PasswordSchema } from "./credentials.js";
import { LocaleSchema } from "./locales.js";
import { RoleSchema } from "./roles.js";

export const TeamSummarySchema = z.object({
  id: z.uuid(),
  nameEn: z.string(),
  nameAr: z.string().nullable(),
});
export type TeamSummary = z.infer<typeof TeamSummarySchema>;

export const UserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  role: RoleSchema,
  locale: LocaleSchema,
  team: TeamSummarySchema.nullable(),
  /** Set when an admin created the account or reset its password. */
  mustChangePassword: z.boolean(),
});
export type User = z.infer<typeof UserSchema>;

/** A user as the admin Users page sees it. */
export const ManagedUserSchema = UserSchema.extend({
  isActive: z.boolean(),
  isDemo: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type ManagedUser = z.infer<typeof ManagedUserSchema>;

export const UsersListResponseSchema = z.object({ users: z.array(ManagedUserSchema) });
export type UsersListResponse = z.infer<typeof UsersListResponseSchema>;

export const ManagedUserResponseSchema = z.object({ user: ManagedUserSchema });
export type ManagedUserResponse = z.infer<typeof ManagedUserResponseSchema>;

export const TeamsListResponseSchema = z.object({ teams: z.array(TeamSummarySchema) });
export type TeamsListResponse = z.infer<typeof TeamsListResponseSchema>;

/** Only team leads have a team, and every team lead has one. */
export const CreateUserRequestSchema = z
  .strictObject({
    email: EmailSchema,
    displayName: z.string().trim().min(1, { error: "required" }).max(120, { error: "too_long" }),
    role: RoleSchema,
    teamId: z.uuid({ error: "required" }).nullable(),
    locale: LocaleSchema,
    password: PasswordSchema,
  })
  .refine((value) => value.role !== "lead" || value.teamId !== null, {
    error: "team_required",
    path: ["teamId"],
  })
  .refine((value) => value.role === "lead" || value.teamId === null, {
    error: "team_only_for_leads",
    path: ["teamId"],
  });
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;
export type CreateUserRequestInput = z.input<typeof CreateUserRequestSchema>;

export const ResetPasswordRequestSchema = z.strictObject({ password: PasswordSchema });
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;
