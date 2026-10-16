import { z } from "zod";
import { AuditEventSchema } from "./audit.js";
import { EvidenceSchema, SeveritySchema } from "./checks.js";
import { TeamSummarySchema } from "./users.js";

/** What raised a flag: a rule's check, an AI judgment, or an unusual pattern (no rule broken). */
export const FLAG_KINDS = ["rule_break", "ai_judgment", "unusual_pattern"] as const;
export const FlagKindSchema = z.enum(FLAG_KINDS);
export type FlagKind = z.infer<typeof FlagKindSchema>;

/**
 * An analyst dismisses a flag or confirms it to its owner team; the team fixes it, and an analyst
 * checks the fix: closed, or sent back to being fixed. Dismissed and closed are final.
 */
export const FLAG_STATUSES = [
  "with_analyst",
  "dismissed",
  "confirmed",
  "being_fixed",
  "fix_submitted",
  "closed",
] as const;
export const FlagStatusSchema = z.enum(FLAG_STATUSES);
export type FlagStatus = z.infer<typeof FlagStatusSchema>;

/** A finding that repeats an open flag is linked to it instead of raising another. */
export const OPEN_FLAG_STATUSES: readonly FlagStatus[] = [
  "with_analyst",
  "confirmed",
  "being_fixed",
  "fix_submitted",
];

/** What a team lead sees of their team's flags: everything from the analyst's confirmation on. */
export const TEAM_FLAG_STATUSES: readonly FlagStatus[] = [
  "confirmed",
  "being_fixed",
  "fix_submitted",
  "closed",
];

export const FLAG_ACTIONS = ["confirm", "dismiss", "assign", "fix", "verify", "send_back"] as const;
export const FlagActionSchema = z.enum(FLAG_ACTIONS);
export type FlagAction = z.infer<typeof FlagActionSchema>;

/** Why an analyst dismissed a flag; normal activity and a known event are for unusual patterns. */
export const DISMISS_REASONS = [
  "false_alarm",
  "data_error",
  "already_fixed",
  "normal_activity",
  "known_event",
  "other",
] as const;
export const DismissReasonSchema = z.enum(DISMISS_REASONS);
export type DismissReason = z.infer<typeof DismissReasonSchema>;

/** The dismissal reasons offered for each kind of flag. */
export const DISMISS_REASONS_FOR: Readonly<Record<FlagKind, readonly DismissReason[]>> = {
  rule_break: ["false_alarm", "data_error", "already_fixed", "other"],
  ai_judgment: ["false_alarm", "data_error", "already_fixed", "other"],
  unusual_pattern: ["normal_activity", "known_event", "other"],
};

/** What the team did, in the source system, about the issue. */
export const FIX_TYPES = [
  "corrected",
  "retrospective_approval",
  "document_added",
  "reversed",
  "other",
] as const;
export const FixTypeSchema = z.enum(FIX_TYPES);
export type FixType = z.infer<typeof FixTypeSchema>;

export const SENIORITY_BANDS = ["junior", "mid", "senior", "executive"] as const;
export const SeniorityBandSchema = z.enum(SENIORITY_BANDS);
export type SeniorityBand = z.infer<typeof SeniorityBandSchema>;

/** Who should hear about a flag, lowest first. Informational: nothing is sent to them. */
export const REPORT_TO_LEVELS = [
  "line_manager",
  "dept_head",
  "hr_manager",
  "hr_director",
  "chro",
] as const;
export const ReportToLevelSchema = z.enum(REPORT_TO_LEVELS);
export type ReportToLevel = z.infer<typeof ReportToLevelSchema>;

/** The highest grade of the junior, mid and senior bands; anyone above `seniorMax` is executive. */
export const SeniorityBandsSchema = z.object({
  juniorMax: z.number(),
  midMax: z.number(),
  seniorMax: z.number(),
});
export type SeniorityBands = z.infer<typeof SeniorityBandsSchema>;

const MatrixRow = z.tuple([
  ReportToLevelSchema,
  ReportToLevelSchema,
  ReportToLevelSchema,
  ReportToLevelSchema,
]);
/** The report-to level for each severity, by band: junior, mid, senior, executive. */
export const ReportToMatrixSchema = z.object({
  High: MatrixRow,
  Medium: MatrixRow,
  Low: MatrixRow,
});
export type ReportToMatrix = z.infer<typeof ReportToMatrixSchema>;

const DueDays = z.number().int().min(1).max(365);
export const FlagSettingsSchema = z.object({
  /** Calendar days from the day a flag is raised until it is due. */
  dueDays: z.object({ High: DueDays, Medium: DueDays, Low: DueDays }),
  /** Null: proposed from the grades in the run's employees file. */
  bands: SeniorityBandsSchema.nullable(),
  reportTo: ReportToMatrixSchema,
});
export type FlagSettings = z.infer<typeof FlagSettingsSchema>;

export const DEFAULT_FLAG_SETTINGS: FlagSettings = {
  dueDays: { High: 3, Medium: 7, Low: 14 },
  bands: null,
  reportTo: {
    Low: ["line_manager", "line_manager", "dept_head", "hr_manager"],
    Medium: ["line_manager", "dept_head", "hr_manager", "hr_director"],
    High: ["dept_head", "hr_manager", "hr_director", "chro"],
  },
};

export const FLAG_PERSON_ROLES = ["employee", "requester", "approver"] as const;
export const FlagPersonRoleSchema = z.enum(FLAG_PERSON_ROLES);
export type FlagPersonRole = z.infer<typeof FlagPersonRoleSchema>;

/** Someone the flagged transaction involves, as the employees file describes them. */
export const FlagPersonSchema = z.object({
  role: FlagPersonRoleSchema,
  id: z.string(),
  /** False when the employees file doesn't have the person. */
  found: z.boolean(),
  grade: z.string().nullable(),
  department: z.string().nullable(),
});
export type FlagPerson = z.infer<typeof FlagPersonSchema>;

/** One step of a flag's severity. */
export const SeverityReasonSchema = z.discriminatedUnion("code", [
  z.object({ code: z.literal("rule_default"), severity: SeveritySchema }),
  /** One level up: the amount is more than twice the rule's limit. */
  z.object({
    code: z.literal("amount_over_double_limit"),
    amount: z.number(),
    limit: z.number(),
  }),
  /** One level up: the same employee or requester has another open flag on the rule. */
  z.object({
    code: z.literal("repeat_open_flag"),
    flagId: z.string(),
    person: z.enum(["employee", "requester"]),
    personId: z.string(),
  }),
  /** An AI judgment with low confidence stays at Medium until an analyst confirms it. */
  z.object({ code: z.literal("low_confidence_cap") }),
  /** The analyst changed it when confirming. */
  z.object({
    code: z.literal("analyst_change"),
    from: SeveritySchema,
    to: SeveritySchema,
    by: z.string(),
  }),
]);
export type SeverityReason = z.infer<typeof SeverityReasonSchema>;

/** Who should hear about a flag, and why. */
export const ReportToSchema = z.object({
  level: ReportToLevelSchema,
  severity: SeveritySchema,
  band: SeniorityBandSchema,
  /** The most senior person involved, whose grade set the band; null when no grade was known. */
  basis: z.object({ role: FlagPersonRoleSchema, id: z.string(), grade: z.number() }).nullable(),
  /** The line manager or department head, by employee ID, when the data names one. */
  personId: z.string().nullable(),
  /**
   * Both people the data names, kept from when the flag was raised, so a change of severity can
   * name the right one after the dataset is gone. Flags raised before they were kept have neither.
   */
  lineManagerId: z.string().nullable().default(null),
  deptHeadId: z.string().nullable().default(null),
});
export type ReportTo = z.infer<typeof ReportToSchema>;

const ActedBy = { by: z.string(), byId: z.string(), at: z.iso.datetime() };

export const FlagChangeSchema = z.object({
  field: z.enum(["severity", "owner", "suggested_fix"]),
  from: z.string().nullable(),
  to: z.string(),
});
export type FlagChange = z.infer<typeof FlagChangeSchema>;

export const FlagDecisionSchema = z.object({
  action: z.enum(["confirm", "dismiss"]),
  ...ActedBy,
  /** Dismissals: why, and the note for the record. */
  reason: DismissReasonSchema.nullable(),
  note: z.string().nullable(),
  /** What the analyst changed when confirming, and why. */
  changes: z.array(FlagChangeSchema),
  changeReason: z.string().nullable(),
});
export type FlagDecision = z.infer<typeof FlagDecisionSchema>;

export const FlagAssignmentSchema = z.object({
  assigneeId: z.string(),
  assignee: z.string(),
  ...ActedBy,
});
export type FlagAssignment = z.infer<typeof FlagAssignmentSchema>;

export const FlagFixSchema = z.object({ type: FixTypeSchema, note: z.string(), ...ActedBy });
export type FlagFix = z.infer<typeof FlagFixSchema>;

export const FlagVerificationSchema = z.object({ ...ActedBy });
export type FlagVerification = z.infer<typeof FlagVerificationSchema>;

export const FlagSentBackSchema = z.object({ reason: z.string(), ...ActedBy });
export type FlagSentBack = z.infer<typeof FlagSentBackSchema>;

export const FlagSeenAgainSchema = z.object({ runId: z.string(), at: z.iso.datetime() });
export type FlagSeenAgain = z.infer<typeof FlagSeenAgainSchema>;

/** A flag in a list. */
export const FlagSummarySchema = z.object({
  id: z.string(),
  kind: FlagKindSchema,
  status: FlagStatusSchema,
  ruleId: z.string(),
  ruleTitle: z.string(),
  transactionIds: z.array(z.string()),
  explanationEn: z.string(),
  explanationAr: z.string(),
  severity: SeveritySchema,
  ownerTeam: TeamSummarySchema.nullable(),
  dueDate: z.iso.date(),
  /** Past its due date and not yet fixed. */
  overdue: z.boolean(),
  assignee: z.string().nullable(),
  fix: FlagFixSchema.nullable(),
  sentBack: FlagSentBackSchema.nullable(),
  /** How many later runs found it again. */
  seenAgain: z.number().int().min(0),
  runId: z.string(),
  createdAt: z.iso.datetime(),
});
export type FlagSummary = z.infer<typeof FlagSummarySchema>;

/** A flag with everything its page shows, and what the reader may do with it. */
export const FlagDetailSchema = FlagSummarySchema.extend({
  ruleVersion: z.number().int().positive(),
  /** The rule as the policy wrote it. */
  ruleText: z.string(),
  restatementEn: z.string().nullable(),
  restatementAr: z.string().nullable(),
  evidence: z.array(EvidenceSchema),
  /** The flagged transaction's cells, in file order. */
  transaction: z.array(z.object({ column: z.string(), value: z.string() })),
  people: z.array(FlagPersonSchema),
  severityReasons: z.array(SeverityReasonSchema),
  reportTo: ReportToSchema,
  suggestedFixEn: z.string(),
  suggestedFixAr: z.string(),
  explanationSource: z.enum(["template", "ai"]),
  decision: FlagDecisionSchema.nullable(),
  assignment: FlagAssignmentSchema.nullable(),
  verification: FlagVerificationSchema.nullable(),
  seenAgainRuns: z.array(FlagSeenAgainSchema),
  /** Other flags on the same transaction. */
  related: z.array(
    z.object({
      id: z.string(),
      ruleId: z.string(),
      ruleTitle: z.string(),
      status: FlagStatusSchema,
    }),
  ),
  /** The flag's audit events, oldest first. */
  timeline: z.array(AuditEventSchema),
  rowVersion: z.number().int().positive(),
  /** What the reader may do now. */
  allowed: z.array(FlagActionSchema),
  /** Who the reader may assign it to, when they may assign it. */
  assignees: z.array(z.object({ id: z.uuid(), displayName: z.string() })),
  /** The teams an analyst can send it to, when they may confirm it. */
  teams: z.array(TeamSummarySchema),
});
export type FlagDetail = z.infer<typeof FlagDetailSchema>;

export const FlagResponseSchema = z.object({ flag: FlagDetailSchema });
export type FlagResponse = z.infer<typeof FlagResponseSchema>;

export const InboxQuerySchema = z.strictObject({
  severity: SeveritySchema.optional(),
  kind: FlagKindSchema.optional(),
  ruleId: z.string().min(1).max(40).optional(),
  /** A team's ID, or "none" for flags without an owner team. */
  teamId: z.union([z.uuid(), z.literal("none")]).optional(),
  runId: z.string().min(1).max(40).optional(),
  /** Where the previous page ended (`nextAfter`). */
  after: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type InboxQuery = z.infer<typeof InboxQuerySchema>;
export type InboxQueryInput = z.input<typeof InboxQuerySchema>;

const Count = z.number().int().min(0);

export const InboxResponseSchema = z.object({
  flags: z.array(FlagSummarySchema),
  nextAfter: z.string().nullable(),
  /** Flags waiting for a decision that match the filters. */
  matching: Count,
  /** Every flag waiting for a decision, whatever the filters. */
  total: Count,
  bySeverity: z.record(SeveritySchema, Count),
  byKind: z.record(FlagKindSchema, Count),
  /** The rules, teams and runs that have flags waiting, for the filters. */
  filters: z.object({
    rules: z.array(z.object({ id: z.string(), title: z.string() })),
    teams: z.array(TeamSummarySchema),
    runs: z.array(z.string()),
  }),
  lastRun: z.object({ id: z.string(), finishedAt: z.iso.datetime() }).nullable(),
});
export type InboxResponse = z.infer<typeof InboxResponseSchema>;

export const FixChecksResponseSchema = z.object({ flags: z.array(FlagSummarySchema) });
export type FixChecksResponse = z.infer<typeof FixChecksResponseSchema>;

export const QueueResponseSchema = z.object({
  team: TeamSummarySchema,
  sentBack: z.array(FlagSummarySchema),
  toFix: z.array(FlagSummarySchema),
  waiting: z.array(FlagSummarySchema),
  /** The 20 most recently closed. */
  closed: z.array(FlagSummarySchema),
});
export type QueueResponse = z.infer<typeof QueueResponseSchema>;

export const FLAG_NOTE_MAX = 1000;
export const FLAG_REASON_MAX = 500;
export const SUGGESTED_FIX_MAX = 300;

/** A note or reason someone writes on a flag. */
export function flagText(max: number) {
  return z.string().trim().min(1, { error: "required" }).max(max, { error: "too_long" });
}

const RowVersion = z.number().int().positive();

export const ConfirmFlagRequestSchema = z.strictObject({
  rowVersion: RowVersion,
  severity: SeveritySchema.optional(),
  ownerTeamId: z.uuid().optional(),
  suggestedFix: flagText(SUGGESTED_FIX_MAX).optional(),
  /** Why anything was changed; the server asks for it when something was. */
  reason: z.string().trim().max(FLAG_REASON_MAX, { error: "too_long" }).optional(),
});
export type ConfirmFlagRequest = z.infer<typeof ConfirmFlagRequestSchema>;

export const DismissFlagRequestSchema = z.strictObject({
  rowVersion: RowVersion,
  reason: DismissReasonSchema,
  note: flagText(FLAG_NOTE_MAX),
});
export type DismissFlagRequest = z.infer<typeof DismissFlagRequestSchema>;

export const AssignFlagRequestSchema = z.strictObject({
  rowVersion: RowVersion,
  assigneeId: z.uuid(),
});
export type AssignFlagRequest = z.infer<typeof AssignFlagRequestSchema>;

export const FixFlagRequestSchema = z.strictObject({
  rowVersion: RowVersion,
  fixType: FixTypeSchema,
  note: flagText(FLAG_NOTE_MAX),
});
export type FixFlagRequest = z.infer<typeof FixFlagRequestSchema>;

export const VerifyFlagRequestSchema = z.strictObject({ rowVersion: RowVersion });
export type VerifyFlagRequest = z.infer<typeof VerifyFlagRequestSchema>;

export const SendBackFlagRequestSchema = z.strictObject({
  rowVersion: RowVersion,
  reason: flagText(FLAG_REASON_MAX),
});
export type SendBackFlagRequest = z.infer<typeof SendBackFlagRequestSchema>;

export const CountsResponseSchema = z.object({
  /** Analysts: flags waiting for a decision. */
  inbox: Count.nullable(),
  /** Analysts: fixes waiting for a check. */
  fixChecks: Count.nullable(),
  /** Team leads: their team's flags to fix. */
  queue: Count.nullable(),
  /** Unread notices. */
  notices: Count,
});
export type CountsResponse = z.infer<typeof CountsResponseSchema>;
