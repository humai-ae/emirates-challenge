import { SECOND_OPINION_QUESTION_SET } from "@hrcc/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { TypeSafeClient } from "@typesafe-ai/sdk";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { TYPESAFE } from "../src/providers/typesafe.js";
import { fakeTypeSafe } from "./fake-typesafe.js";

const token = "test-token-0123456789";
const body = {
  rules: [
    { id: "R-01", text: "Allowance changes above AED 10,000 need a Grade 10 approver." },
    { id: "R-02", text: "The requester must not also approve the transaction." },
  ],
  transactions: [
    {
      key: "row-7",
      rules: [0, 1],
      fields: [
        { name: "amount", value: "16200" },
        { name: "approvers[].grade", value: ["8"] },
        { name: "requester", value: "[EMP_1]" },
      ],
      gaps: [{ name: "approved_after_effective", days: -4 }],
    },
    {
      key: "row-9",
      rules: [1],
      fields: [{ name: "requester", value: "[EMP_2]" }],
      gaps: [],
    },
  ],
};

const ANSWERS: Record<string, number> = {
  t0_r0: 0.93,
  t0_r1: 0.08,
  t1_r1: 0.2,
  t0_enough: 0.95,
  t1_enough: 0.4,
};

describe("second opinions from Jev", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function start(client: TypeSafeClient | null) {
    Object.assign(process.env, { AI_SERVICE_TOKEN: token });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TYPESAFE)
      .useValue(client)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    return request(app.getHttpServer());
  }

  const ask = (http: Awaited<ReturnType<typeof start>>, payload: object = body) =>
    http.post("/v1/second-opinion/evaluate").set("Authorization", `Bearer ${token}`).send(payload);

  it("asks about each transaction's own rules, and whether there's enough to judge", async () => {
    const { client, sent } = fakeTypeSafe((id) => ({ type: "noul", noul: ANSWERS[id] ?? 0.5 }));
    const response = await ask(await start(client)).expect(200);
    expect(response.body.answers).toEqual([
      { key: "row-7", rule: "R-01", pBreak: 0.93 },
      { key: "row-7", rule: "R-02", pBreak: 0.08 },
      { key: "row-9", rule: "R-02", pBreak: 0.2 },
    ]);
    expect(response.body.enough).toEqual([
      { key: "row-7", p: 0.95 },
      { key: "row-9", p: 0.4 },
    ]);
    expect(response.body.provenance).toMatchObject({ version: SECOND_OPINION_QUESTION_SET });
    // One question per transaction and its own rules, and one about enough information each.
    expect(Object.keys(sent[0]?.questions ?? {}).sort()).toEqual(Object.keys(ANSWERS).sort());
    expect(sent[0]?.state).toEqual({
      rules: body.rules,
      transactions: [
        {
          rules: ["R-01", "R-02"],
          fields: { amount: "16200", "approvers[].grade": ["8"], requester: "[EMP_1]" },
          gaps: { approved_after_effective: -4 },
        },
        { rules: ["R-02"], fields: { requester: "[EMP_2]" }, gaps: {} },
      ],
    });
  });

  it("says when Jev isn't set up, and refuses more than ten transactions", async () => {
    await ask(await start(null)).expect(503);
    await app?.close();
    const { client } = fakeTypeSafe(() => ({ type: "noul", noul: 0.5 }));
    const http = await start(client);
    const many = Array.from({ length: 11 }, (_, index) => ({
      ...body.transactions[1],
      key: `row-${index}`,
    }));
    await ask(http, { ...body, transactions: many }).expect(400);
  });
});
