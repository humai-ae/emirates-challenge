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
  rule: {
    id: "R-07",
    text: "Justifications for pay changes above AED 5,000 must give a clear business reason.",
  },
  items: [
    {
      key: "k1",
      field: "justification",
      text: "as discussed",
      type: "pay_change",
      amountBand: "5,000 to 10,000",
    },
    {
      key: "k2",
      field: "justification",
      text: "Market rate adjustment",
      type: "pay_change",
      amountBand: null,
    },
  ],
};

/** "as discussed" reads as a placeholder; anything else as a specific, acceptable reason. */
function answer(id: string) {
  const vague = id.startsWith("t0_");
  const yes = id.endsWith("_specific") || id.endsWith("_accept") ? !vague : vague;
  return { type: "noul", noul: id.endsWith("_enough") ? 0.95 : yes ? 0.9 : 0.08 };
}

describe("judging texts against a rule", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function start(client: TypeSafeClient | null) {
    Object.assign(process.env, { AI_SERVICE_TOKEN: token, TYPESAFE_API_KEY: "" });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TYPESAFE)
      .useValue(client)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    return request(app.getHttpServer());
  }

  const evaluate = (http: Awaited<ReturnType<typeof start>>, payload: object = body) =>
    http.post("/v1/judgments/evaluate").set("Authorization", `Bearer ${token}`).send(payload);

  it("asks Jev four questions about each text in one request, and answers by key", async () => {
    const { client, sent } = fakeTypeSafe(answer);
    const response = await evaluate(await start(client)).expect(200);
    expect(response.body.answers).toEqual([
      { key: "k1", specific: 0.08, placeholder: 0.9, accept: 0.08, enough: 0.95 },
      { key: "k2", specific: 0.9, placeholder: 0.08, accept: 0.9, enough: 0.95 },
    ]);
    expect(response.body.provenance).toMatchObject({
      provider: "typesafe",
      model: "jev-1.13.0",
      version: "judgment-v1",
    });
    expect(sent).toHaveLength(1);
    const [sentRequest] = sent;
    expect(Object.keys(sentRequest?.questions ?? {})).toEqual([
      "t0_specific",
      "t0_placeholder",
      "t0_accept",
      "t0_enough",
      "t1_specific",
      "t1_placeholder",
      "t1_accept",
      "t1_enough",
    ]);
    expect(JSON.stringify(sentRequest?.questions.t1_accept)).toContain("`items[1].text`");
    // Code's keys stay with code: Jev sees the rule and the texts with their context.
    expect(sentRequest?.state).toEqual({
      rule: body.rule,
      items: [
        {
          field: "justification",
          text: "as discussed",
          transaction_type: "pay_change",
          amount: "5,000 to 10,000",
        },
        {
          field: "justification",
          text: "Market rate adjustment",
          transaction_type: "pay_change",
          amount: null,
        },
      ],
    });
  });

  it("says when Jev isn't set up", async () => {
    const response = await evaluate(await start(null)).expect(503);
    expect(response.body).toEqual({
      code: "provider_not_configured",
      params: { provider: "typesafe" },
    });
  });

  it("reports a Jev failure and an answer of the wrong type", async () => {
    const failing = fakeTypeSafe(answer, 529);
    await evaluate(await start(failing.client)).expect(502);
    await app?.close();
    const wrong = fakeTypeSafe(() => ({
      type: "choice",
      choice: "x",
      confidence: 1,
      probabilities: { x: 1 },
    }));
    const response = await evaluate(await start(wrong.client)).expect(502);
    expect(response.body.params).toMatchObject({ reason: "unexpected_answer" });
  });

  it("refuses more than a batch of texts, and fields it doesn't know", async () => {
    const { client } = fakeTypeSafe(answer);
    const http = await start(client);
    const [first] = body.items;
    const many = Array.from({ length: 21 }, (_, index) => ({ ...first, key: `k${index}` }));
    await evaluate(http, { ...body, items: many }).expect(400);
    await evaluate(http, { ...body, items: [{ ...first, employeeId: "E-1182" }] }).expect(400);
  });
});
