import type { FlagResponse, NoticesResponse } from "@hrcc/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Agent, EMAILS, type FlagsFixture, runWithFlags } from "./flags-setup.js";
import { CSRF, createTestApp, signIn, type TestApp } from "./test-app.js";

/** Today in Dubai, plus some days, as YYYY-MM-DD. */
function dubaiDayPlus(days: number): string {
  const today = new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10);
  return new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

describe("analyst decisions", () => {
  let t: TestApp;
  let fx: FlagsFixture;
  let analyst: Agent;
  let priya: Agent;
  let ahmed: Agent;
  beforeAll(async () => {
    t = await createTestApp();
    fx = await runWithFlags(t);
    analyst = await signIn(t, EMAILS.analyst);
    priya = await signIn(t, EMAILS.payrollLead);
    ahmed = await signIn(t, EMAILS.onboardingLead);
  }, 60_000);
  afterAll(async () => {
    await t.close();
  });

  const post = (agent: Agent, id: string, action: string, body: object) =>
    agent.post(`/api/v1/flags/${id}/${action}`).set(CSRF).send(body);

  it("confirms a flag to its owner team and tells the team's leads", async () => {
    const { flag } = (await post(analyst, "F-000001", "confirm", { rowVersion: 1 }).expect(200))
      .body as FlagResponse;
    expect(flag).toMatchObject({
      status: "confirmed",
      rowVersion: 2,
      allowed: [],
      ownerTeam: { nameEn: "Payroll & Compensation" },
      decision: { action: "confirm", by: "Omar Siddiqui", changes: [], changeReason: null },
    });
    expect(flag.timeline.map((event) => event.action)).toEqual(["flag.create", "flag.confirm"]);
    const { notices } = (await priya.get("/api/v1/notices").expect(200)).body as NoticesResponse;
    expect(notices.map((notice) => [notice.kind, notice.params.flagId, notice.params.by])).toEqual([
      ["flag_sent_to_team", "F-000001", "Omar Siddiqui"],
    ]);
    expect((await priya.get("/api/v1/me/counts").expect(200)).body.queue).toBe(1);
    expect((await analyst.get("/api/v1/me/counts").expect(200)).body.inbox).toBe(12);
  });

  it("needs a team for a flag without one, and no reason to choose it", async () => {
    expect(
      (await post(analyst, "F-000009", "confirm", { rowVersion: 1 }).expect(400)).body.code,
    ).toBe("flag_owner_required");
    const { flag } = (
      await post(analyst, "F-000009", "confirm", {
        rowVersion: 1,
        ownerTeamId: fx.teams.onboarding,
      }).expect(200)
    ).body as FlagResponse;
    expect(flag).toMatchObject({
      status: "confirmed",
      ownerTeam: { nameEn: "Onboarding" },
      decision: { changes: [] },
    });
    const { notices } = (await ahmed.get("/api/v1/notices").expect(200)).body as NoticesResponse;
    expect(notices[0]?.params.flagId).toBe("F-000009");
  });

  it("needs a reason for a change, and records it", async () => {
    // F-000010 has no owner: choosing Payroll isn't a change, lowering the severity is.
    expect(
      (
        await post(analyst, "F-000010", "confirm", {
          rowVersion: 1,
          ownerTeamId: fx.teams.payroll,
          severity: "Medium",
        }).expect(400)
      ).body.code,
    ).toBe("flag_change_reason_required");
    const { flag } = (
      await post(analyst, "F-000010", "confirm", {
        rowVersion: 1,
        ownerTeamId: fx.teams.payroll,
        severity: "Medium",
        reason: "The two pay changes are one correction entered twice.",
      }).expect(200)
    ).body as FlagResponse;
    expect(flag).toMatchObject({
      severity: "Medium",
      dueDate: dubaiDayPlus(7),
      decision: {
        changes: [{ field: "severity", from: "High", to: "Medium" }],
        changeReason: "The two pay changes are one correction entered twice.",
      },
    });
    expect(flag.severityReasons.at(-1)).toEqual({
      code: "analyst_change",
      from: "High",
      to: "Medium",
      by: "Omar Siddiqui",
    });
    expect(flag.timeline.map((event) => event.action)).toEqual([
      "flag.create",
      "flag.change",
      "flag.confirm",
    ]);
    expect(flag.timeline[1]?.reason).toBe("The two pay changes are one correction entered twice.");

    // An owner and a suggested fix changed together.
    const { flag: moved } = (
      await post(analyst, "F-000002", "confirm", {
        rowVersion: 1,
        ownerTeamId: fx.teams.payroll,
        suggestedFix: "Ask a second approver to sign off.",
        reason: "Payroll handles promotions with pay effects.",
      }).expect(200)
    ).body as FlagResponse;
    expect(moved.decision?.changes).toEqual([
      { field: "owner", from: "Onboarding", to: "Payroll & Compensation" },
      {
        field: "suggested_fix",
        from: expect.any(String),
        to: "Ask a second approver to sign off.",
      },
    ]);
    expect([moved.suggestedFixEn, moved.suggestedFixAr]).toEqual([
      "Ask a second approver to sign off.",
      "Ask a second approver to sign off.",
    ]);
  });

  it("needs an allowed reason and a note to dismiss", async () => {
    expect(
      (
        await post(analyst, "F-000003", "dismiss", {
          rowVersion: 1,
          reason: "normal_activity",
          note: "Seen before.",
        }).expect(400)
      ).body.code,
    ).toBe("dismiss_reason_not_allowed");
    await post(analyst, "F-000003", "dismiss", {
      rowVersion: 1,
      reason: "false_alarm",
      note: "",
    }).expect(400);
    const { flag } = (
      await post(analyst, "F-000003", "dismiss", {
        rowVersion: 1,
        reason: "false_alarm",
        note: "The approver was acting head of department that week.",
      }).expect(200)
    ).body as FlagResponse;
    expect(flag).toMatchObject({
      status: "dismissed",
      decision: { action: "dismiss", reason: "false_alarm" },
    });
    expect(flag.timeline.at(-1)).toMatchObject({
      action: "flag.dismiss",
      reason: "The approver was acting head of department that week.",
    });
  });

  it("answers a second decision with who decided first", async () => {
    const other = await signIn(t, EMAILS.analyst);
    const results = await Promise.all([
      post(analyst, "F-000004", "confirm", { rowVersion: 1 }),
      post(other, "F-000004", "dismiss", { rowVersion: 1, reason: "data_error", note: "Typo." }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const refused = results.find((result) => result.status === 409);
    expect(refused?.body).toEqual({
      code: "flag_changed",
      params: { status: expect.stringMatching(/^(confirmed|dismissed)$/), by: "Omar Siddiqui" },
    });
    const [{ count }]: Array<{ count: number }> = await t.dataSource.query(
      "SELECT count(*)::int AS count FROM audit_events WHERE object_id = 'F-000004' AND action IN ('flag.confirm', 'flag.dismiss')",
    );
    expect(count).toBe(1);
  });

  it("keeps decisions to analysts", async () => {
    for (const email of [EMAILS.admin, EMAILS.auditor, EMAILS.payrollLead]) {
      const agent = await signIn(t, email);
      expect(
        (await post(agent, "F-000005", "confirm", { rowVersion: 1 }).expect(403)).body.code,
      ).toBe("forbidden");
    }
    await post(analyst, "F-999999", "confirm", { rowVersion: 1 }).expect(404);
  });
});
