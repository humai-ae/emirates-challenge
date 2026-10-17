import { PATTERN_QUESTION_SET } from "@hrcc/shared";
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
  candidates: [
    {
      key: "just_under_limit|R-01:E-0003",
      detector: "just_under_limit",
      description:
        "Amounts just under an approval limit, made by the same requester far more often than by others.",
      facts: [
        { key: "requester", value: "[EMP_1]" },
        { key: "near_limit", value: 6 },
        { key: "of", value: 8 },
      ],
    },
    {
      key: "rare_type|TX-9",
      detector: "rare_type",
      description: "A transaction type that is rare for the employee's department.",
      facts: [
        { key: "type", value: "transfer" },
        { key: "count", value: 1 },
      ],
    },
  ],
};

/** Jev finds the first candidate a likely control issue and the second benign. */
function answer(id: string): unknown {
  const likely = id === "c0";
  return {
    type: "score",
    score: likely ? 1.7 : 0.2,
    confidence: 0.8,
    legend: { "0": "Benign", "1": "Worth a look", "2": "Likely control issue" },
    probabilities: likely
      ? { "0": 0.05, "1": 0.2, "2": 0.75 }
      : { "0": 0.82, "1": 0.16, "2": 0.02 },
  };
}

describe("ranking unusual patterns with Jev", () => {
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

  const rank = (http: Awaited<ReturnType<typeof start>>, payload: object = body) =>
    http.post("/v1/patterns/rank").set("Authorization", `Bearer ${token}`).send(payload);

  it("ranks each candidate by Jev's score, from benign to likely issue", async () => {
    const { client, sent } = fakeTypeSafe(answer);
    const response = await rank(await start(client)).expect(200);
    expect(response.body.ranks).toEqual([
      {
        key: "just_under_limit|R-01:E-0003",
        concern: 0.85,
        probabilities: { benign: 0.05, worth_a_look: 0.2, likely_issue: 0.75 },
      },
      {
        key: "rare_type|TX-9",
        concern: 0.1,
        probabilities: { benign: 0.82, worth_a_look: 0.16, likely_issue: 0.02 },
      },
    ]);
    expect(response.body.provenance).toMatchObject({
      provider: "typesafe",
      version: PATTERN_QUESTION_SET,
    });
    const questions = Object.values(sent[0]?.questions ?? {});
    expect(questions.map((question) => question.type)).toEqual(["score", "score"]);
    // Jev reads each candidate's description and facts, nothing else.
    expect(sent[0]?.state).toEqual({
      candidates: [
        {
          detector: "just_under_limit",
          description: body.candidates[0]?.description,
          facts: { requester: "[EMP_1]", near_limit: 6, of: 8 },
        },
        {
          detector: "rare_type",
          description: body.candidates[1]?.description,
          facts: { type: "transfer", count: 1 },
        },
      ],
    });
  });

  it("says when Jev isn't set up, and refuses more than a batch", async () => {
    await rank(await start(null)).expect(503);
    await app?.close();
    const { client } = fakeTypeSafe(answer);
    const http = await start(client);
    const many = Array.from({ length: 21 }, (_, index) => ({
      ...body.candidates[0],
      key: `c${index}`,
    }));
    await rank(http, { candidates: many }).expect(400);
  });
});
