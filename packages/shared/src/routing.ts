import { z } from "zod";
import { OwnerEntrySchema } from "./rules.js";
import { TeamSummarySchema } from "./users.js";

/** Who owns findings on one transaction type. */
export const RoutingRowSchema = z.object({
  type: z.string(),
  team: TeamSummarySchema.nullable(),
  /** Who last set it, and when; null while nobody has. */
  setBy: z.string().nullable(),
  setAt: z.iso.datetime().nullable(),
});
export type RoutingRow = z.infer<typeof RoutingRowSchema>;

export const RoutingResponseSchema = z.object({
  /** The newest dataset's transaction types, then any other type already routed. */
  rows: z.array(RoutingRowSchema),
  /** Owner teams the newest policy upload names. */
  policyOwners: z.array(OwnerEntrySchema),
});
export type RoutingResponse = z.infer<typeof RoutingResponseSchema>;

export const ROUTING_SOURCES = ["policy", "ai"] as const;
export const RoutingProposalSchema = z.object({
  proposals: z.array(
    z.object({
      type: z.string(),
      team: z.string(),
      source: z.enum(ROUTING_SOURCES),
      /** AI's certainty; null for a team the policy names. */
      confidence: z.number().min(0).max(1).nullable(),
    }),
  ),
  /** Types nothing was proposed for: the policy doesn't name them and AI is off or unsure. */
  unassigned: z.array(z.string()),
});
export type RoutingProposal = z.infer<typeof RoutingProposalSchema>;

export const TeamNameSchema = z
  .string()
  .trim()
  .min(1, { error: "required" })
  .max(80, { error: "too_long" });

/** Rows to set; a null team clears the row, and types left out stay as they are. */
export const SaveRoutingRequestSchema = z.strictObject({
  rows: z
    .array(z.strictObject({ type: z.string().min(1).max(64), teamName: TeamNameSchema.nullable() }))
    .max(200)
    .superRefine((rows, context) => {
      const seen = new Set<string>();
      rows.forEach((row, index) => {
        const key = row.type.toLowerCase();
        if (seen.has(key)) {
          context.addIssue({ code: "custom", path: [index, "type"], message: "type_repeated" });
        }
        seen.add(key);
      });
    }),
});
export type SaveRoutingRequest = z.infer<typeof SaveRoutingRequestSchema>;

export const TeamRequestSchema = z.strictObject({
  nameEn: TeamNameSchema,
  /** May be blank: the English name shows instead. */
  nameAr: z.string().trim().max(80, { error: "too_long" }),
});
export type TeamRequest = z.infer<typeof TeamRequestSchema>;

export const TeamResponseSchema = z.object({ team: TeamSummarySchema });
export type TeamResponse = z.infer<typeof TeamResponseSchema>;
