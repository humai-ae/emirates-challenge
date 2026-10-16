import { z } from "zod";

/** In-app messages people get as flags move and as their rule requests are decided. */
export const NOTICE_KINDS = [
  "flag_sent_to_team",
  "flag_assigned",
  "flag_fix_submitted",
  "flag_sent_back",
  "flag_closed",
  "rule_request_live",
  "rule_request_rejected",
] as const;
export const NoticeKindSchema = z.enum(NOTICE_KINDS);
export type NoticeKind = z.infer<typeof NoticeKindSchema>;

export const NoticeSchema = z.object({
  id: z.uuid(),
  kind: NoticeKindSchema,
  /** Values for the notice's sentence: a flag or rule ID, a name, a reason. */
  params: z.record(z.string(), z.string()),
  createdAt: z.iso.datetime(),
  readAt: z.iso.datetime().nullable(),
});
export type Notice = z.infer<typeof NoticeSchema>;

export const NoticesResponseSchema = z.object({
  /** The newest 50, newest first. */
  notices: z.array(NoticeSchema),
  unread: z.number().int().min(0),
});
export type NoticesResponse = z.infer<typeof NoticesResponseSchema>;
