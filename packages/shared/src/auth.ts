import { z } from "zod";
import { EmailSchema, PasswordAttemptSchema, PasswordSchema } from "./credentials.js";
import { LocaleSchema } from "./locales.js";
import { UserSchema } from "./users.js";

export const CSRF_HEADER = "x-hrcc-request";
export const SESSION_COOKIE = "hrcc_session";

export const LoginRequestSchema = z.strictObject({
  email: EmailSchema,
  password: PasswordAttemptSchema,
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginRequestInput = z.input<typeof LoginRequestSchema>;

export const ChangePasswordRequestSchema = z.strictObject({
  currentPassword: PasswordAttemptSchema,
  newPassword: PasswordSchema,
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const UpdatePreferencesRequestSchema = z.strictObject({ locale: LocaleSchema });
export type UpdatePreferencesRequest = z.infer<typeof UpdatePreferencesRequestSchema>;

export const MeResponseSchema = z.object({ user: UserSchema });
export type MeResponse = z.infer<typeof MeResponseSchema>;
