import { z } from "zod";

export const AUDIT_ACTIONS = [
  "auth.sign_in",
  "auth.sign_out",
  "auth.password_change",
  "user.preferences_update",
  "user.create",
  "user.deactivate",
  "user.reactivate",
  "user.password_reset",
  "audit.integrity_check",
] as const;
export const AuditActionSchema = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof AuditActionSchema>;

/** Present on events written by an AI step. */
export const AuditAiSchema = z.object({
  provider: z.string(),
  model: z.string(),
  promptVersion: z.string().nullable(),
  inputRef: z.string().nullable(),
  output: z.unknown(),
});
export type AuditAi = z.infer<typeof AuditAiSchema>;

export const AuditEventSchema = z.object({
  seq: z.number().int().positive(),
  eventId: z.string(),
  at: z.iso.datetime(),
  actorId: z.string(),
  actorName: z.string(),
  role: z.string(),
  action: AuditActionSchema,
  objectType: z.string(),
  objectId: z.string(),
  before: z.unknown(),
  after: z.unknown(),
  reason: z.string().nullable(),
  ai: AuditAiSchema.nullable(),
  prevHash: z.string(),
  hash: z.string(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const AuditListQuerySchema = z.strictObject({
  actorId: z.string().min(1).optional(),
  action: AuditActionSchema.optional(),
  objectId: z.string().min(1).optional(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AuditListQuery = z.infer<typeof AuditListQuerySchema>;
export type AuditListQueryInput = z.input<typeof AuditListQuerySchema>;

export const AuditListResponseSchema = z.object({
  events: z.array(AuditEventSchema),
  nextBefore: z.number().int().positive().nullable(),
});
export type AuditListResponse = z.infer<typeof AuditListResponseSchema>;

export const IntegrityResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), count: z.number().int().min(0), checkedAt: z.iso.datetime() }),
  z.object({
    ok: z.literal(false),
    count: z.number().int().min(0),
    brokenAt: z.string(),
    checkedAt: z.iso.datetime(),
  }),
]);
export type IntegrityResult = z.infer<typeof IntegrityResultSchema>;
