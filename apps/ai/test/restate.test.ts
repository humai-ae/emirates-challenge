import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type OpenAI from "openai";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { TEXT_MODEL_CLIENT } from "../src/providers/text-model.js";
import { fakeTextModelBy } from "./fake-text-model.js";

const token = "test-token-0123456789";
const body = {
  rule: {
    id: "R-07",
    text: "Justifications for pay changes above AED 5,000 must give a clear business reason.",
  },
  items: [
    { key: "k1", field: "justification", text: "COLA 2026" },
    { key: "k2", field: "justification", text: "Workload" },
  ],
};

/** COLA is spelled out; anything else gets no clear kind. */
function reply(user: string): string {
  const { justification } = JSON.parse(user) as { justification: string };
  return justification.startsWith("COLA")
    ? JSON.stringify({ restated: "A cost-of-living adjustment for 2026.", kind: "cost_of_living" })
    : JSON.stringify({
        restated: `The justification is ${justification.toLowerCase()}.`,
        kind: "unclear",
      });
}

describe("restating a text once, for a second Jev answer", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function start(client: OpenAI | null) {
    Object.assign(process.env, { AI_SERVICE_TOKEN: token });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TEXT_MODEL_CLIENT)
      .useValue(client)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    return request(app.getHttpServer());
  }

  const restate = (http: Awaited<ReturnType<typeof start>>, payload: object = body) =>
    http.post("/v1/judgments/restate").set("Authorization", `Bearer ${token}`).send(payload);

  it("restates each text once and names the kind of reason it gives", async () => {
    const { client, sent } = fakeTextModelBy(reply);
    const response = await restate(await start(client)).expect(200);
    expect(response.body.items).toEqual([
      { key: "k1", restated: "A cost-of-living adjustment for 2026.", kind: "cost_of_living" },
      { key: "k2", restated: "The justification is workload.", kind: "unclear" },
    ]);
    expect(response.body.provenance).toMatchObject({
      provider: "text_model",
      version: "restate-v1",
    });
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ response_format: { type: "json_schema" } });
  });

  it("drops a restatement that gives a number the text doesn't", async () => {
    const { client } = fakeTextModelBy(() =>
      JSON.stringify({ restated: "A 5% merit increase after the review.", kind: "performance" }),
    );
    const response = await restate(await start(client), {
      ...body,
      items: [{ key: "k", field: "justification", text: "Merit increase" }],
    }).expect(200);
    expect(response.body.items).toEqual([{ key: "k", restated: "", kind: "unclear" }]);
  });

  it("drops a restatement that adds the rule's number, and keeps the text's own shorthand", async () => {
    const { client } = fakeTextModelBy((user) => {
      const { justification } = JSON.parse(user) as { justification: string };
      return JSON.stringify(
        justification === "Merit increase"
          ? { restated: "A merit increase above AED 5,000.", kind: "performance" }
          : { restated: "A merit increase for FY26.", kind: "performance" },
      );
    });
    const response = await restate(await start(client), {
      ...body,
      items: [
        { key: "rule", field: "justification", text: "Merit increase" },
        { key: "fy", field: "justification", text: "Merit increase FY26" },
      ],
    }).expect(200);
    expect(response.body.items).toEqual([
      { key: "rule", restated: "", kind: "unclear" },
      { key: "fy", restated: "A merit increase for FY26.", kind: "performance" },
    ]);
  });

  it("asks for numbers and people's tokens exactly as the text writes them", async () => {
    const { client, sent } = fakeTextModelBy(reply);
    await restate(await start(client)).expect(200);
    const messages = sent[0]?.messages as Array<{ content: string }> | undefined;
    const system = messages?.[0]?.content ?? "";
    expect(system).toContain("FY26 stays FY26");
    expect(system).toContain("[EMP_1]");
    expect(system).not.toContain("financial year 2026");
  });

  it("leaves a text the text model fails on unclear, and fails only when it fails on every text", async () => {
    const { client } = fakeTextModelBy((user) =>
      user.includes("Workload") ? { status: 400 } : reply(user),
    );
    const response = await restate(await start(client)).expect(200);
    expect(response.body.items).toEqual([
      { key: "k1", restated: "A cost-of-living adjustment for 2026.", kind: "cost_of_living" },
      { key: "k2", restated: "", kind: "unclear" },
    ]);
    await app?.close();
    const failing = fakeTextModelBy(() => ({ status: 400 }));
    await restate(await start(failing.client)).expect(502);
  });

  it("treats a refusal or an answer that isn't the JSON asked for as unclear, without asking again", async () => {
    const { client, sent } = fakeTextModelBy((user) =>
      user.includes("COLA") ? { refusal: "no" } : "not json",
    );
    const response = await restate(await start(client)).expect(200);
    expect(response.body.items.map((item: { kind: string }) => item.kind)).toEqual([
      "unclear",
      "unclear",
    ]);
    expect(sent).toHaveLength(2);
  });

  it("says when the text model isn't set up, and refuses more than a batch", async () => {
    await restate(await start(null)).expect(503);
    await app?.close();
    const { client } = fakeTextModelBy(reply);
    const http = await start(client);
    const many = Array.from({ length: 21 }, (_, index) => ({ ...body.items[0], key: `k${index}` }));
    await restate(http, { ...body, items: many }).expect(400);
  });
});
