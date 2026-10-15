import { z } from "zod";
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
  username: z.string(),
  displayName: z.string(),
  role: RoleSchema,
  locale: LocaleSchema,
  team: TeamSummarySchema.nullable(),
});
export type User = z.infer<typeof UserSchema>;
