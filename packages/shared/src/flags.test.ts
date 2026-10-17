import { describe, expect, it } from "vitest";
import {
  ConfirmFlagRequestSchema,
  CountsResponseSchema,
  DEFAULT_FLAG_SETTINGS,
  DISMISS_REASONS_FOR,
  DismissFlagRequestSchema,
  FixFlagRequestSchema,
  FLAG_WRITING,
  FlagDetailSchema,
  FlagJudgmentSchema,
  FlagSummarySchema,
  InboxQuerySchema,
  REPORT_TO_LEVELS,
  type ReportToLevel,
  SendBackFlagRequestSchema,
} from "./flags.js";
import { NoticeSchema } from "./notices.js";
import { RunTotalsSchema } from "./runs.js";

const firstMessage = (result: { error?: { issues: Array<{ message: string }> } }) =>
  result.error?.issues[0]?.message;

describe("flag decisions", () => {
  it("confirms with only the row version, or with changes and a reason", () => {
    expect(ConfirmFlagRequestSchema.safeParse({ rowVersion: 1 }).success).toBe(true);
    expect(
      ConfirmFlagRequestSchema.parse({
        rowVersion: 2,
        severity: "Low",
        suggestedFix: "  Reverse the change.  ",
        reason: " Small amount ",
      }),
    ).toEqual({
      rowVersion: 2,
      severity: "Low",
      suggestedFix: "Reverse the change.",
      reason: "Small amount",
    });
    expect(
      firstMessage(ConfirmFlagRequestSchema.safeParse({ rowVersion: 1, suggestedFix: "   " })),
    ).toBe("required");
    expect(ConfirmFlagRequestSchema.safeParse({ rowVersion: 1, status: "closed" }).success).toBe(
      false,
    );
  });

  it("needs a reason and a note to dismiss", () => {
    expect(
      DismissFlagRequestSchema.safeParse({
        rowVersion: 1,
        reason: "false_alarm",
        note: "The approver was acting head of department.",
      }).success,
    ).toBe(true);
    expect(
      firstMessage(
        DismissFlagRequestSchema.safeParse({ rowVersion: 1, reason: "false_alarm", note: " " }),
      ),
    ).toBe("required");
    expect(
      DismissFlagRequestSchema.safeParse({ rowVersion: 1, reason: "bored", note: "x" }).success,
    ).toBe(false);
  });

  it("offers the pattern reasons only for unusual patterns", () => {
    expect(DISMISS_REASONS_FOR.rule_break).toEqual([
      "false_alarm",
      "data_error",
      "already_fixed",
      "other",
    ]);
    expect(DISMISS_REASONS_FOR.unusual_pattern).toEqual([
      "normal_activity",
      "known_event",
      "other",
    ]);
  });

  it("needs what was done to mark fixed, and what is wrong to send back", () => {
    expect(
      FixFlagRequestSchema.safeParse({
        rowVersion: 3,
        fixType: "document_added",
        note: "Clearance form attached in the HR system.",
      }).success,
    ).toBe(true);
    expect(
      FixFlagRequestSchema.safeParse({ rowVersion: 3, fixType: "document_added", note: "" })
        .success,
    ).toBe(false);
    expect(
      firstMessage(SendBackFlagRequestSchema.safeParse({ rowVersion: 4, reason: "x".repeat(501) })),
    ).toBe("too_long");
  });
});

describe("flag settings", () => {
  it("reports higher as severity and seniority rise", () => {
    const rank = (level: ReportToLevel | undefined) =>
      REPORT_TO_LEVELS.indexOf(level ?? "line_manager");
    const { reportTo, dueDays } = DEFAULT_FLAG_SETTINGS;
    for (const row of [reportTo.Low, reportTo.Medium, reportTo.High]) {
      const ranks = row.map(rank);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
    reportTo.Low.forEach((level, band) => {
      expect(rank(level)).toBeLessThanOrEqual(rank(reportTo.Medium[band]));
      expect(rank(reportTo.Medium[band])).toBeLessThanOrEqual(rank(reportTo.High[band]));
    });
    expect(dueDays).toEqual({ High: 3, Medium: 7, Low: 14 });
  });
});

describe("inbox, counts and notices", () => {
  it("reads the inbox filters from the query string", () => {
    expect(InboxQuerySchema.parse({ severity: "High", teamId: "none", limit: "20" })).toEqual({
      severity: "High",
      teamId: "none",
      limit: 20,
    });
    expect(InboxQuerySchema.safeParse({ teamId: "payroll" }).success).toBe(false);
  });

  it("counts only what a role has", () => {
    expect(
      CountsResponseSchema.parse({ inbox: null, fixChecks: null, queue: 4, notices: 1 }),
    ).toMatchObject({ queue: 4, inbox: null });
  });

  it("keeps a notice's values as text", () => {
    expect(
      NoticeSchema.safeParse({
        id: "8f5f0a52-3a0f-4c1e-9d7a-2b8c5e1f4a10",
        kind: "flag_assigned",
        params: { flagId: "F-000001", by: "Priya Nair" },
        createdAt: "2026-10-16T08:00:00.000Z",
        readAt: null,
      }).success,
    ).toBe(true);
  });

  it("reads the totals of runs from before flags", () => {
    expect(
      RunTotalsSchema.parse({
        transactions: 3,
        findings: 1,
        couldNotCheck: 0,
        waitingForAi: 0,
        durationMs: 5,
      }),
    ).toMatchObject({ newFlags: 0, seenAgain: 0 });
  });
});

describe("AI on a flag", () => {
  it("keeps what AI read, how likely it breaks the rule and its four answers", () => {
    const judgment = {
      field: "justification",
      text: "as discussed",
      decision: "breaks",
      pBreak: 0.93,
      answers: { specific: 0.04, placeholder: 0.93, accept: 0.06, enough: 0.9 },
      model: "jev-1.13.0",
    };
    expect(FlagJudgmentSchema.safeParse(judgment).success).toBe(true);
    expect(FlagJudgmentSchema.parse(judgment).restatement).toBeNull();
    expect(
      FlagJudgmentSchema.parse({
        ...judgment,
        restatement: { restated: "The text refers to an earlier discussion.", kind: "none" },
      }).restatement?.kind,
    ).toBe("none");
    expect(FlagJudgmentSchema.safeParse({ ...judgment, decision: "does_not_break" }).success).toBe(
      false,
    );
    // People's IDs put back can make a restatement longer than the text model's 400 characters.
    const long = { restated: `${"x".repeat(395)} EMP-000123`, kind: "retention" };
    expect(FlagJudgmentSchema.safeParse({ ...judgment, restatement: long }).success).toBe(true);
  });

  it("knows whether AI is writing a flag's texts", () => {
    expect(FLAG_WRITING).toEqual(["none", "pending", "done", "failed"]);
  });
});

describe("what a flag's page knows about AI", () => {
  it("has each language's source, the writing state and the standard wording", () => {
    expect(Object.keys(FlagDetailSchema.shape)).toEqual(
      expect.arrayContaining([
        "textSources",
        "writing",
        "standardExplanationEn",
        "standardExplanationAr",
        "standardFixEn",
        "standardFixAr",
        "judgment",
      ]),
    );
    expect(Object.keys(FlagDetailSchema.shape)).not.toContain("explanationSource");
    expect(FlagSummarySchema.shape.confidence.safeParse(null).success).toBe(true);
  });
});
