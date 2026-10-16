import type { RoutingProposal, RoutingResponse, TeamsListResponse } from "@hrcc/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AI_TOKEN, type FakeAi, startFakeAi } from "./fake-ai.js";
import { uploadPack } from "./packs.js";
import { CSRF, createTestApp, signIn, type TestApp } from "./test-app.js";

type Agent = Awaited<ReturnType<typeof signIn>>;

const POLICY = Buffer.from(`# Policy

| Transaction type | Owner team |
|---|---|
| allowance_change | Payroll Operations |
| pay_change | payroll operations |
| exit | Employee Services |

## R-01 Approval of large allowance changes
Allowance changes above AED 10,000 must be approved by at least one approver at Grade 10 or above.

## R-02 No self-approval
The person who requests a transaction must not also approve it.
`);
const PACK_TYPES = ["allowance_change", "overtime", "pay_change", "transfer", "promotion", "exit"];

async function uploadPolicy(admin: Agent) {
  return admin.post("/api/v1/policies").set(CSRF).attach("policy", POLICY, "policy.md").expect(201);
}

describe("routing and teams", () => {
  let t: TestApp;
  let admin: Agent;
  beforeAll(async () => {
    t = await createTestApp();
    admin = await signIn(t, "layla.haddad@emirates.test");
    await uploadPack(admin);
  });
  afterAll(async () => {
    await t.close();
  });

  const routing = async () =>
    (await admin.get("/api/v1/routing").expect(200)).body as RoutingResponse;
  const owners = (response: RoutingResponse) =>
    response.rows.map((row) => [row.type, row.team?.nameEn ?? null]);

  it("keeps the owner teams the policy names, and proposes them", async () => {
    const upload = await uploadPolicy(admin);
    expect(upload.body.upload.ownerTable).toEqual([
      { type: "allowance_change", team: "Payroll Operations" },
      { type: "pay_change", team: "payroll operations" },
      { type: "exit", team: "Employee Services" },
    ]);
    const before = await routing();
    expect(owners(before)).toEqual(PACK_TYPES.map((type) => [type, null]));
    expect(before.policyOwners).toHaveLength(3);
    const proposal = (await admin.post("/api/v1/routing/proposal").set(CSRF).expect(200))
      .body as RoutingProposal;
    expect(proposal).toEqual({
      proposals: [
        {
          type: "allowance_change",
          team: "Payroll Operations",
          source: "policy",
          confidence: null,
        },
        { type: "pay_change", team: "payroll operations", source: "policy", confidence: null },
        { type: "exit", team: "Employee Services", source: "policy", confidence: null },
      ],
      // AI is off, so the types the policy doesn't name stay for the admin.
      unassigned: ["overtime", "transfer", "promotion"],
    });
  });

  it("matches team names whatever their case, and creates the rest", async () => {
    const saved = await admin
      .put("/api/v1/routing")
      .set(CSRF)
      .send({
        rows: [
          { type: "allowance_change", teamName: "Payroll Operations" },
          { type: "pay_change", teamName: "payroll operations" },
          { type: "exit", teamName: "Employee Services" },
        ],
      })
      .expect(200);
    const response = saved.body as RoutingResponse;
    expect(owners(response)).toEqual([
      ["allowance_change", "Payroll Operations"],
      ["overtime", null],
      ["pay_change", "Payroll Operations"],
      ["transfer", null],
      ["promotion", null],
      ["exit", "Employee Services"],
    ]);
    expect(response.rows[0]?.setBy).toBe("Layla Haddad");
    const teams = ((await admin.get("/api/v1/teams").expect(200)).body as TeamsListResponse).teams;
    expect(teams.map((team) => team.nameEn)).toEqual([
      "Employee Services",
      "Onboarding",
      "Payroll & Compensation",
      "Payroll Operations",
    ]);
    const audit = await admin.get("/api/v1/audit?action=routing.edit").expect(200);
    expect(audit.body.events[0].after).toMatchObject({
      createdTeams: ["Payroll Operations", "Employee Services"],
    });
  });

  it("refuses a transaction type the data doesn't have, and clears a row set to no team", async () => {
    const unknown = await admin
      .put("/api/v1/routing")
      .set(CSRF)
      .send({ rows: [{ type: "bonus", teamName: "Payroll Operations" }] })
      .expect(400);
    expect(unknown.body).toEqual({ code: "routing_type_unknown", params: { type: "bonus" } });
    const cleared = await admin
      .put("/api/v1/routing")
      .set(CSRF)
      .send({ rows: [{ type: "exit", teamName: null }] })
      .expect(200);
    expect(owners(cleared.body as RoutingResponse).at(-1)).toEqual(["exit", null]);
  });

  it("gives a new draft the team that owns all its transaction types", async () => {
    const written = await admin
      .post("/api/v1/rules")
      .set(CSRF)
      .send({
        text: "Allowance changes above AED 10,000 must be approved by at least one approver at Grade 10 or above.",
      })
      .expect(201);
    expect(written.body.rule.versions[0].ownerTeam).toMatchObject({ nameEn: "Payroll Operations" });
  });

  it("creates and renames teams, keeping their names unique", async () => {
    const created = await admin
      .post("/api/v1/teams")
      .set(CSRF)
      .send({ nameEn: "Leave & Attendance", nameAr: "" })
      .expect(201);
    expect(created.body.team).toMatchObject({ nameEn: "Leave & Attendance", nameAr: null });
    const taken = await admin
      .post("/api/v1/teams")
      .set(CSRF)
      .send({ nameEn: "leave & attendance", nameAr: "" })
      .expect(409);
    expect(taken.body.code).toBe("team_name_taken");
    const renamed = await admin
      .patch(`/api/v1/teams/${created.body.team.id}`)
      .set(CSRF)
      .send({ nameEn: "Leave & Attendance", nameAr: "الإجازات والحضور" })
      .expect(200);
    expect(renamed.body.team.nameAr).toBe("الإجازات والحضور");
    await admin
      .patch(`/api/v1/teams/${created.body.team.id}`)
      .set(CSRF)
      .send({ nameEn: "Onboarding", nameAr: "" })
      .expect(409);
    const audit = await admin.get("/api/v1/audit?action=team.update").expect(200);
    expect(audit.body.events[0]).toMatchObject({ objectId: created.body.team.id });
    const analyst = await signIn(t, "omar.siddiqui@emirates.test");
    await analyst.post("/api/v1/teams").set(CSRF).send({ nameEn: "X", nameAr: "" }).expect(403);
    await analyst.get("/api/v1/routing").expect(403);
  });
});

describe("routing proposals with AI", () => {
  let t: TestApp;
  let ai: FakeAi;
  let admin: Agent;
  beforeAll(async () => {
    ai = await startFakeAi();
    t = await createTestApp({
      AI_SERVICE_URL: ai.url,
      AI_SERVICE_TOKEN: AI_TOKEN,
      JOBS_POLL_SECONDS: "0.5",
    });
    admin = await signIn(t, "layla.haddad@emirates.test");
    await uploadPack(admin);
    await uploadPolicy(admin);
  });
  afterAll(async () => {
    await t.close();
    await ai.close();
  });

  it("asks AI for the types the policy doesn't name, from the teams it knows", async () => {
    const proposal = (await admin.post("/api/v1/routing/proposal").set(CSRF).expect(200))
      .body as RoutingProposal;
    expect(proposal.proposals.filter((item) => item.source === "ai")).toEqual([
      { type: "overtime", team: "Payroll Operations", source: "ai", confidence: 0.8 },
      { type: "transfer", team: "Payroll Operations", source: "ai", confidence: 0.8 },
      { type: "promotion", team: "Payroll Operations", source: "ai", confidence: 0.8 },
    ]);
    expect(proposal.unassigned).toEqual([]);
    const asked = ai.received.find((request) => request.path === "/v1/routing/propose")?.body;
    expect(asked?.types).toEqual(["overtime", "transfer", "promotion"]);
    expect(asked?.teams).toEqual(
      expect.arrayContaining([
        "Payroll Operations",
        "Employee Services",
        "Payroll & Compensation",
        "HR Operations",
      ]),
    );
    // "payroll operations" in the policy is the same team as "Payroll Operations".
    expect(
      ((asked?.teams ?? []) as string[]).filter(
        (team) => team.toLowerCase() === "payroll operations",
      ),
    ).toHaveLength(1);
  });
});
