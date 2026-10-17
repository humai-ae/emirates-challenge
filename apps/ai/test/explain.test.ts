import { AiExplainResponseSchema } from "@hrcc/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { TypeSafeClient } from "@typesafe-ai/sdk";
import type OpenAI from "openai";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { TEXT_MODEL_CLIENT } from "../src/providers/text-model.js";
import { TYPESAFE } from "../src/providers/typesafe.js";
import { fakeTextModel } from "./fake-text-model.js";
import { fakeTypeSafe, picks, type SentQuestion } from "./fake-typesafe.js";

const token = "test-token-0123456789";
const body = {
  kind: "rule_break",
  rule: {
    id: "R-01",
    title: "Approval of large allowance changes",
    text: "Allowance changes above AED 10,000 need an approver at Grade 10 or above.",
  },
  transactionId: "TX-000006",
  evidence: [{ field: "amount", value: "16200", condition: "> 10000" }],
  severity: "High",
  team: "Payroll & Compensation",
  action: {
    en: "Get approval from a Grade 10 approver, or reverse the change.",
    ar: "احصل على اعتماد من معتمِد في الدرجة 10، أو ألغِ التغيير.",
  },
  standard: { en: "The amount 16,200 is over 10,000.", ar: "المبلغ 16,200 أكثر من 10,000." },
  judgment: null,
  people: ["[EMP_1]"],
};
const en = {
  explanation: "TX-000006 for [EMP_1] broke R-01: the amount 16,200 is over 10,000.",
  fix: "Get approval from a Grade 10 approver, or reverse the change.",
};
const ar = {
  explanation:
    "خالفت المعاملة TX-000006 الخاصة بـ [EMP_1] القاعدة R-01: المبلغ 16,200 أكثر من 10,000.",
  fix: "احصل على اعتماد من معتمِد في الدرجة 10، أو ألغِ التغيير.",
};
const reply = (texts: { en: typeof en; ar: typeof ar }) => JSON.stringify(texts);

/** Jev: the explanation is supported, the fix fits and the Arabic says the same, unless told otherwise. */
function jev(verdicts: Partial<Record<"explanation" | "fix" | "arabic", number>> = {}) {
  return fakeTypeSafe((id: string, question: SentQuestion) => {
    if (id === "explanation") {
      const p = verdicts.explanation ?? 0.95;
      return p >= 0.5 ? picks(question, "supports", p) : picks(question, "says_nothing", 1 - p);
    }
    return { type: "noul", noul: verdicts[id as "fix" | "arabic"] ?? 0.9 };
  });
}

describe("explanations and fixes, written by the text model and checked", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function start(text: OpenAI | null, typesafe: TypeSafeClient | null) {
    Object.assign(process.env, { AI_SERVICE_TOKEN: token });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TEXT_MODEL_CLIENT)
      .useValue(text)
      .overrideProvider(TYPESAFE)
      .useValue(typesafe)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    return request(app.getHttpServer());
  }

  const explain = (http: Awaited<ReturnType<typeof start>>) =>
    http.post("/v1/texts/explain").set("Authorization", `Bearer ${token}`).send(body);

  it("writes both languages from the flag's data, and Jev checks them", async () => {
    const text = fakeTextModel([reply({ en, ar })]);
    const checks = jev();
    const response = await explain(await start(text.client, checks.client)).expect(200);
    expect(response.body).toMatchObject({
      en,
      ar,
      rejected: [],
      verification: { explanation: 0.95, fix: 0.9, arabic: 0.9 },
      provenance: { provider: "text_model", version: "explain-v1" },
    });
    const [sent] = text.sent;
    expect(sent).toMatchObject({ response_format: { type: "json_schema" } });
    expect(JSON.stringify(sent)).toContain("[EMP_1]");
    // Jev sees the rule, the evidence and the texts, and is asked about each.
    expect(Object.keys(checks.sent[0]?.questions ?? {})).toEqual(["explanation", "fix", "arabic"]);
  });

  it("sends a text with an invented number back once, then uses it when it's right", async () => {
    const invented = { ...en, fix: "Get Grade 10 approval within 5 days." };
    const text = fakeTextModel([reply({ en: invented, ar }), reply({ en, ar })]);
    const response = await explain(await start(text.client, jev().client)).expect(200);
    expect(response.body.en).toEqual(en);
    // The Arabic had no checked English to match yet, so it was asked for again too.
    expect(response.body.rejected).toEqual([
      {
        ...invented,
        attempt: 1,
        language: "en",
        problem: "the fix gives numbers the data doesn't: 5",
      },
      {
        ...ar,
        attempt: 1,
        language: "ar",
        problem: "the English it was compared with didn't pass its checks",
      },
    ]);
    expect(response.body.ar).toEqual(ar);
    const retry = text.sent[1]?.messages as Array<{ role: string; content: string }>;
    expect(retry.at(-1)?.content).toContain("the fix gives numbers the data doesn't: 5");
  });

  it("drops the Arabic for the standard wording when it fails twice", async () => {
    const wrong = { ...ar, explanation: "المبلغ 17,000 أكثر من الحد." };
    const text = fakeTextModel([reply({ en, ar: wrong })]);
    const response = await explain(await start(text.client, jev().client)).expect(200);
    expect(response.body.en).toEqual(en);
    expect(response.body.ar).toBeNull();
    expect(
      response.body.rejected.map((item: { attempt: number; language: string }) => [
        item.attempt,
        item.language,
      ]),
    ).toEqual([
      [1, "ar"],
      [2, "ar"],
    ]);
  });

  it("asks again when Jev finds a statement the data doesn't support", async () => {
    const text = fakeTextModel([reply({ en, ar })]);
    const response = await explain(
      await start(text.client, jev({ explanation: 0.3 }).client),
    ).expect(200);
    expect(response.body.en).toBeNull();
    // The Arabic only matched an English text Jev rejected: it isn't used either.
    expect(response.body.ar).toBeNull();
    expect(response.body.rejected[0]).toMatchObject({
      language: "en",
      problem: "Jev found a statement in the explanation the data doesn't support",
    });
    expect(response.body.rejected[1]).toMatchObject({
      language: "ar",
      problem: "the English it was compared with didn't pass its checks",
    });
    expect(text.sent).toHaveLength(2);
  });

  it("compares a retried Arabic with the English already accepted", async () => {
    const wrongArabic = { ...ar, explanation: "المبلغ 17,000 أكثر من الحد." };
    const otherEnglish = { ...en, explanation: "TX-000006 broke R-01 for [EMP_1]." };
    const text = fakeTextModel([reply({ en, ar: wrongArabic }), reply({ en: otherEnglish, ar })]);
    const checks = jev();
    const response = await explain(await start(text.client, checks.client)).expect(200);
    expect(response.body.en).toEqual(en);
    expect(response.body.ar).toEqual(ar);
    const second = checks.sent[1]?.state as { explanation_en: string };
    expect(second.explanation_en).toBe(en.explanation);
  });

  it("gives Jev the AI judgment when it checks an AI judgment's explanation", async () => {
    const text = fakeTextModel([reply({ en, ar })]);
    const checks = jev();
    const http = await start(text.client, checks.client);
    await http
      .post("/v1/texts/explain")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...body, kind: "ai_judgment", judgment: { decision: "breaks", likelihood: 93 } })
      .expect(200);
    const sent = checks.sent[0];
    const state = sent?.state as { ai_judgment: unknown } | undefined;
    expect(state?.ai_judgment).toEqual({
      decision: "breaks",
      likelihood_percent: 93,
    });
    expect(JSON.stringify(sent?.questions.explanation)).toContain("`ai_judgment`");
  });

  it("keeps a reply that isn't JSON among the rejected texts, within the contract", async () => {
    const text = fakeTextModel(["", reply({ en, ar })]);
    const response = await explain(await start(text.client, jev().client)).expect(200);
    expect(response.body.en).toEqual(en);
    expect(response.body.rejected).toHaveLength(2);
    expect(AiExplainResponseSchema.safeParse(response.body).success).toBe(true);
  });

  it("uses texts that pass the fact-check when Jev isn't set up, and says Jev didn't check", async () => {
    const text = fakeTextModel([reply({ en, ar })]);
    const response = await explain(await start(text.client, null)).expect(200);
    expect(response.body).toMatchObject({
      en,
      ar,
      verification: { explanation: null, fix: null, arabic: null },
    });
  });

  it("says when the text model isn't set up, and reports it failing", async () => {
    await explain(await start(null, null)).expect(503);
    await app?.close();
    const failing = fakeTextModel([]);
    failing.client.chat.completions.create = (() =>
      Promise.reject(new Error("boom"))) as unknown as OpenAI["chat"]["completions"]["create"];
    await explain(await start(failing.client, null)).expect(502);
  });
});
