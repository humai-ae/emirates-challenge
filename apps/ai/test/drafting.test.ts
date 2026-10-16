import { PRESET_IDS } from "@hrcc/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { TypeSafeClient } from "@typesafe-ai/sdk";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { TYPESAFE } from "../src/providers/typesafe.js";
import { fakeTypeSafe, lastOption, picks, type SentQuestion } from "./fake-typesafe.js";

const token = "test-token-0123456789";
const R01 =
  "Allowance changes above AED 10,000 must be approved by at least one approver at Grade 10 or above.";
const body = {
  text: R01,
  columns: [
    { name: "transaction_id", type: "id", role: "transaction_id" },
    { name: "amount", type: "integer", role: "amount" },
    { name: "justification", type: "text", role: "text" },
  ],
  candidates: { amounts: [10000], grades: [10], days: [], counts: [] },
  vocabulary: { types: ["allowance_change", "pay_change"], documents: ["clearance_form"] },
};

/** Jev answering R-01 as an approver-grade rule about allowance changes. */
function answerR01(id: string, question: SentQuestion): unknown {
  if (id === "preset_a") return picks(question, "approver_min_grade", 0.92);
  if (id === "preset_b") return picks(question, "approver_min_grade", 0.86);
  if (id === "amount") return picks(question, "10,000", 0.97);
  if (id === "grade") return picks(question, "Grade 10", 0.93);
  if (question.type === "noul") return { type: "noul", noul: id === "type_0" ? 0.97 : 0.04 };
  if (question.type === "score") {
    return {
      type: "score",
      score: 1.86,
      confidence: 0.8,
      legend: { "0": "Low", "1": "Medium", "2": "High" },
      probabilities: { "0": 0.02, "1": 0.1, "2": 0.88 },
    };
  }
  return picks(question, lastOption(question), 0.8);
}

describe("drafting a rule with Jev", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
  });

  async function start(client: TypeSafeClient | null) {
    Object.assign(process.env, { AI_SERVICE_TOKEN: token, ANTHROPIC_FOUNDRY_API_KEY: "" });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TYPESAFE)
      .useValue(client)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    return request(app.getHttpServer());
  }

  const draft = (http: Awaited<ReturnType<typeof start>>, payload: object = body) =>
    http.post("/v1/rules/draft").set("Authorization", `Bearer ${token}`).send(payload);

  it("asks for the check type twice in opposite orders, and offers the rule's own numbers", async () => {
    const { client, sent } = fakeTypeSafe(answerR01);
    const response = await draft(await start(client)).expect(200);
    const questions = sent[0]?.questions ?? {};
    const options = (id: string) => Object.keys(questions[id]?.criteria as object);
    expect(options("preset_a")).toEqual([...PRESET_IDS, "none_fits"]);
    expect(options("preset_b")).toEqual([...[...PRESET_IDS].reverse(), "none_fits"]);
    expect(options("amount")).toEqual(["10,000", "not_stated"]);
    expect(options("grade")).toEqual(["Grade 10", "not_stated"]);
    expect(options("number_field")).toEqual(["amount", "not_stated"]);
    expect(options("text_field")).toEqual(["justification", "not_stated"]);
    // The rule names no days and no count, so nothing is asked about them.
    expect(questions.days).toBeUndefined();
    expect(questions.count).toBeUndefined();
    expect(response.body).toMatchObject({
      presets: [{ approver_min_grade: 0.92 }, { approver_min_grade: 0.86 }],
      amount: { value: 10000, probability: 0.97 },
      grade: { value: 10, probability: 0.93 },
      days: { value: null, probability: 1 },
      numberField: { value: null, probability: 0.8 },
      everyType: 0.04,
      types: { allowance_change: 0.97, pay_change: 0.04 },
      documents: { clearance_form: 0.04 },
      severity: { value: "High", probability: 0.88 },
      provenance: { provider: "typesafe", model: "jev-1.13.0", version: "rule-draft-v1" },
    });
    expect(response.body.provenance.inputSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sends Jev only the rule, the column names and the vocabularies", async () => {
    const { client, sent } = fakeTypeSafe(answerR01);
    await draft(await start(client)).expect(200);
    expect(sent[0]?.state).toEqual({
      rule: R01,
      columns: ["transaction_id", "amount", "justification"],
      transaction_types: ["allowance_change", "pay_change"],
      document_types: ["clearance_form"],
    });
  });

  it("refuses a request carrying fields AI may not see", async () => {
    const http = await start(fakeTypeSafe(answerR01).client);
    const response = await draft(http, { ...body, rows: [{ amount: "16200" }] }).expect(400);
    expect(response.body.code).toBe("validation_failed");
  });

  it("says when TypeSafe isn't set up, and when it fails", async () => {
    const missing = await draft(await start(null)).expect(503);
    expect(missing.body).toEqual({
      code: "provider_not_configured",
      params: { provider: "typesafe" },
    });
    await app?.close();
    const failing = await draft(await start(fakeTypeSafe(answerR01, 529).client)).expect(502);
    expect(failing.body).toEqual({
      code: "provider_failed",
      params: { provider: "typesafe", reason: "request_failed" },
    });
  });
});
