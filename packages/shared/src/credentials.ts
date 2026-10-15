import { z } from "zod";

// Validation messages are translation keys (`validation.*` in the `ui` namespace), so the
// same schema drives the API's checks and the translated form errors.

export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Trimmed and lower-cased before it is checked, stored or compared. */
export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "email_invalid" }).max(EMAIL_MAX_LENGTH, { error: "email_invalid" }));

/** A new password: 12–128 characters, no composition rules. */
export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { error: "password_too_short" })
  .max(PASSWORD_MAX_LENGTH, { error: "password_too_long" });

/** A password being checked rather than chosen: anything non-empty up to the maximum. */
export const PasswordAttemptSchema = z
  .string()
  .min(1, { error: "required" })
  .max(PASSWORD_MAX_LENGTH, { error: "password_too_long" });
