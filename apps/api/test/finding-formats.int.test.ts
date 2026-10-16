import { type FindingFormatResponse, MAX_FORMAT_BYTES } from "@hrcc/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixture } from "./packs.js";
import { CSRF, createTestApp, signIn, type TestApp } from "./test-app.js";

type Agent = Awaited<ReturnType<typeof signIn>>;
const FORMAT = fixture("finding_format.csv");
const PROPOSED = [
  "finding_id",
  "transaction_id",
  "rule_id",
  "severity",
  "description",
  "evidence",
  "owner",
  "recommended_action",
];

describe("finding formats", () => {
  let t: TestApp;
  let admin: Agent;
  beforeAll(async () => {
    t = await createTestApp();
    admin = await signIn(t, "layla.haddad@emirates.test");
  });
  afterAll(async () => {
    await t.close();
  });

  const upload = (agent: Agent, file: Buffer, filename = "finding_format.csv") =>
    agent.post("/api/v1/finding-formats").set(CSRF).attach("format", file, filename);

  it("proposes a mapping for an uploaded format from its column names", async () => {
    expect((await admin.get("/api/v1/finding-formats/current").expect(200)).body).toEqual({
      format: null,
    });
    const { format } = (await upload(admin, FORMAT).expect(201)).body as FindingFormatResponse;
    expect(format).toMatchObject({
      filename: "finding_format.csv",
      columns: PROPOSED,
      mapping: PROPOSED,
      values: {
        severity: "title",
        findingIdPrefix: "F-",
        findingIdWidth: 4,
        dateFormat: null,
        status: "OPEN",
      },
      confirmedAt: null,
      rowVersion: 1,
      uploadedBy: "Layla Haddad",
    });
    expect(format?.examples).toHaveLength(5);
    expect(format?.examples[0]?.slice(0, 3)).toEqual(["F-0001", "TX-000004", "R-01"]);
    const current = (await admin.get("/api/v1/finding-formats/current").expect(200))
      .body as FindingFormatResponse;
    expect(current.format?.id).toBe(format?.id);
    const events = await t.dataSource.query(
      "SELECT after FROM audit_events WHERE action = 'format.upload'",
    );
    expect(events[0].after.name).toBe("finding_format.csv");
  });

  it("refuses files that aren't a CSV finding format", async () => {
    const missing = await admin.post("/api/v1/finding-formats").set(CSRF).expect(400);
    expect(missing.body).toEqual({ code: "file_missing", params: { file: "format" } });
    const text = await upload(admin, FORMAT, "finding_format.txt").expect(400);
    expect(text.body).toEqual({ code: "file_type_not_allowed", params: { file: "format" } });
    const latin1 = await upload(admin, Buffer.from([0x61, 0xe9, 0x0a, 0x62, 0x0a])).expect(400);
    expect(latin1.body).toEqual({
      code: "file_unreadable",
      params: { file: "format", reason: "not_utf8" },
    });
    const empty = await upload(admin, Buffer.from(" \n")).expect(400);
    expect(empty.body.params).toEqual({ file: "format", reason: "empty" });
    const big = await upload(admin, Buffer.alloc(MAX_FORMAT_BYTES + 1, "a")).expect(413);
    expect(big.body.code).toBe("file_too_large");
  });

  it("confirms the mapping, and refuses one that can't be scored", async () => {
    const { format } = (await admin.get("/api/v1/finding-formats/current").expect(200))
      .body as FindingFormatResponse;
    const id = format?.id;
    const confirm = (body: object) =>
      admin.patch(`/api/v1/finding-formats/${id}/mapping`).set(CSRF).send(body);
    const noRule = await confirm({
      rowVersion: 1,
      mapping: PROPOSED.map((field) => (field === "rule_id" ? null : field)),
    }).expect(400);
    expect(noRule.body.params.issues[0].message).toBe("mapping_incomplete");
    const short = await confirm({ rowVersion: 1, mapping: ["transaction_id", "rule_id"] }).expect(
      400,
    );
    expect(short.body.params.issues[0].message).toBe("wrong_length");
    const blanked = PROPOSED.map((field) => (field === "owner" ? null : field));
    const done = (await confirm({ rowVersion: 1, mapping: blanked }).expect(200))
      .body as FindingFormatResponse;
    expect(done.format).toMatchObject({
      mapping: blanked,
      rowVersion: 2,
      confirmedBy: "Layla Haddad",
    });
    expect(done.format?.confirmedAt).not.toBeNull();
    expect((await confirm({ rowVersion: 1, mapping: PROPOSED }).expect(409)).body.code).toBe(
      "conflict",
    );
    const events = await t.dataSource.query(
      "SELECT after FROM audit_events WHERE action = 'format.mapping_confirm'",
    );
    expect(events).toHaveLength(1);
  });

  it("lets only admins upload or confirm a format", async () => {
    const analyst = await signIn(t, "omar.siddiqui@emirates.test");
    await upload(analyst, FORMAT).expect(403);
    const current = (await analyst.get("/api/v1/finding-formats/current").expect(200))
      .body as FindingFormatResponse;
    await analyst
      .patch(`/api/v1/finding-formats/${current.format?.id}/mapping`)
      .set(CSRF)
      .send({ rowVersion: 2, mapping: PROPOSED })
      .expect(403);
    const lead = await signIn(t, "priya.nair@emirates.test");
    await lead.get("/api/v1/finding-formats/current").expect(403);
  });
});
