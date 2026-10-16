import type { FlagResponse, NoticesResponse, QueueResponse } from "@hrcc/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Agent, EMAILS, runWithFlags } from "./flags-setup.js";
import { CSRF, createTestApp, signIn, type TestApp } from "./test-app.js";

describe("fixing a flag", () => {
  let t: TestApp;
  let analyst: Agent;
  let priya: Agent;
  let ahmed: Agent;
  let priyaId: string;
  let ahmedId: string;
  let analystId: string;
  beforeAll(async () => {
    t = await createTestApp();
    await runWithFlags(t);
    analyst = await signIn(t, EMAILS.analyst);
    priya = await signIn(t, EMAILS.payrollLead);
    ahmed = await signIn(t, EMAILS.onboardingLead);
    priyaId = (await priya.get("/api/v1/me").expect(200)).body.user.id;
    ahmedId = (await ahmed.get("/api/v1/me").expect(200)).body.user.id;
    analystId = (await analyst.get("/api/v1/me").expect(200)).body.user.id;
    for (const id of ["F-000001", "F-000002"]) {
      await analyst
        .post(`/api/v1/flags/${id}/confirm`)
        .set(CSRF)
        .send({ rowVersion: 1 })
        .expect(200);
    }
  }, 60_000);
  afterAll(async () => {
    await t.close();
  });

  const post = (agent: Agent, id: string, action: string, body: object) =>
    agent.post(`/api/v1/flags/${id}/${action}`).set(CSRF).send(body);
  const queue = async (agent: Agent) =>
    (await agent.get("/api/v1/flags/queue").expect(200)).body as QueueResponse;
  const notices = async (agent: Agent) =>
    ((await agent.get("/api/v1/notices").expect(200)).body as NoticesResponse).notices;

  it("lets the team lead take a confirmed flag and assign it", async () => {
    expect((await queue(priya)).toFix.map((flag) => flag.id)).toEqual(["F-000001"]);
    const { flag } = (
      await post(priya, "F-000001", "assign", { rowVersion: 2, assigneeId: priyaId }).expect(200)
    ).body as FlagResponse;
    expect(flag).toMatchObject({
      status: "being_fixed",
      assignee: "Priya Nair",
      assignment: { assignee: "Priya Nair", by: "Priya Nair" },
      allowed: ["assign", "fix"],
    });
    expect((await priya.get("/api/v1/me/counts").expect(200)).body.queue).toBe(1);
    // Nobody is told of their own action.
    expect((await notices(priya)).map((notice) => notice.kind)).toEqual(["flag_sent_to_team"]);
  });

  it("keeps leads to their own team's flags and members", async () => {
    await post(ahmed, "F-000001", "assign", { rowVersion: 3, assigneeId: ahmedId }).expect(404);
    expect(
      (await post(priya, "F-000001", "assign", { rowVersion: 3, assigneeId: ahmedId }).expect(400))
        .body.code,
    ).toBe("assignee_not_in_team");
    await priya.get("/api/v1/flags/F-000002").expect(404);
  });

  it("marks a flag fixed and tells the analyst who confirmed it", async () => {
    const { flag } = (
      await post(priya, "F-000001", "fix", {
        rowVersion: 3,
        fixType: "retrospective_approval",
        note: "A grade 12 approver signed off in the HR system.",
      }).expect(200)
    ).body as FlagResponse;
    expect(flag).toMatchObject({
      status: "fix_submitted",
      fix: { type: "retrospective_approval", by: "Priya Nair" },
      allowed: [],
    });
    expect((await notices(analyst)).map((notice) => [notice.kind, notice.params.flagId])).toEqual([
      ["flag_fix_submitted", "F-000001"],
    ]);
    expect((await analyst.get("/api/v1/flags/fix-checks").expect(200)).body.flags).toHaveLength(1);
    expect((await analyst.get("/api/v1/me/counts").expect(200)).body.fixChecks).toBe(1);
    expect((await queue(priya)).waiting.map((item) => item.id)).toEqual(["F-000001"]);
  });

  it("sends a fix back with what is still wrong", async () => {
    await post(analyst, "F-000001", "send-back", { rowVersion: 4, reason: "" }).expect(400);
    const { flag } = (
      await post(analyst, "F-000001", "send-back", {
        rowVersion: 4,
        reason: "The sign-off has no date.",
      }).expect(200)
    ).body as FlagResponse;
    expect(flag).toMatchObject({
      status: "being_fixed",
      sentBack: { reason: "The sign-off has no date.", by: "Omar Siddiqui" },
    });
    const told = (await notices(priya)).find((notice) => notice.kind === "flag_sent_back");
    expect(told?.params.reason).toBe("The sign-off has no date.");
    expect((await queue(priya)).sentBack.map((item) => item.id)).toEqual(["F-000001"]);
  });

  it("refuses a fix on a flag sent back while the lead was looking", async () => {
    expect(
      (
        await post(priya, "F-000001", "fix", {
          rowVersion: 4,
          fixType: "corrected",
          note: "Done.",
        }).expect(409)
      ).body,
    ).toEqual({ code: "flag_changed", params: { status: "being_fixed", by: "Omar Siddiqui" } });
  });

  it("checks a fix and closes the flag", async () => {
    await post(priya, "F-000001", "fix", {
      rowVersion: 5,
      fixType: "retrospective_approval",
      note: "Dated sign-off attached.",
    }).expect(200);
    const { flag } = (await post(analyst, "F-000001", "verify", { rowVersion: 6 }).expect(200))
      .body as FlagResponse;
    expect(flag).toMatchObject({
      status: "closed",
      verification: { by: "Omar Siddiqui" },
      sentBack: null,
    });
    expect(flag.timeline.map((event) => event.action)).toEqual([
      "flag.create",
      "flag.confirm",
      "flag.assign",
      "flag.fix_submit",
      "flag.send_back",
      "flag.fix_submit",
      "flag.verify",
    ]);
    expect((await notices(priya)).map((notice) => notice.kind)).toContain("flag_closed");
    expect((await queue(priya)).closed.map((item) => item.id)).toEqual(["F-000001"]);
    expect((await analyst.get("/api/v1/me/counts").expect(200)).body.fixChecks).toBe(0);
  });

  it("never lets the person who fixed it check the fix", async () => {
    // As if the analyst had submitted the fix themselves.
    await t.dataSource.query(
      `UPDATE flags SET status = 'fix_submitted', assignee_user_id = $1,
         fix = jsonb_build_object('type', 'corrected', 'note', 'Done.', 'by', 'Omar Siddiqui', 'byId', $2::text, 'at', '2026-10-16T08:00:00.000Z')
       WHERE id = 'F-000002'`,
      [ahmedId, analystId],
    );
    const [{ row_version }]: Array<{ row_version: number }> = await t.dataSource.query(
      "SELECT row_version FROM flags WHERE id = 'F-000002'",
    );
    expect(
      (await post(analyst, "F-000002", "verify", { rowVersion: row_version }).expect(403)).body
        .code,
    ).toBe("fix_check_own_fix");
    const [{ status }]: Array<{ status: string }> = await t.dataSource.query(
      "SELECT status FROM flags WHERE id = 'F-000002'",
    );
    expect(status).toBe("fix_submitted");
  });

  it("keeps each step to its role", async () => {
    await post(analyst, "F-000002", "assign", { rowVersion: 1, assigneeId: ahmedId }).expect(403);
    await post(priya, "F-000002", "verify", { rowVersion: 1 }).expect(403);
    const admin = await signIn(t, EMAILS.admin);
    await post(admin, "F-000002", "fix", { rowVersion: 1, fixType: "other", note: "x" }).expect(
      403,
    );
  });
});
