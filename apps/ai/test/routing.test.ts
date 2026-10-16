import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { TYPESAFE } from "../src/providers/typesafe.js";
import { fakeTypeSafe, picks } from "./fake-typesafe.js";

const token = "test-token-0123456789";

describe("owner teams for transaction types", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
  });

  it("asks which listed team owns each type, and reads 'none' as no team", async () => {
    const { client, sent } = fakeTypeSafe((id, question) =>
      picks(question, id === "type_0" ? "Payroll Operations" : "none", 0.82),
    );
    Object.assign(process.env, { AI_SERVICE_TOKEN: token });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TYPESAFE)
      .useValue(client)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    const response = await request(app.getHttpServer())
      .post("/v1/routing/propose")
      .set("Authorization", `Bearer ${token}`)
      .send({
        types: ["pay_change", "overtime"],
        teams: ["Payroll Operations", "Employee Services"],
      })
      .expect(200);
    expect(response.body.owners).toEqual([
      { type: "pay_change", team: "Payroll Operations", probability: 0.82 },
      { type: "overtime", team: null, probability: 0.82 },
    ]);
    expect(response.body.provenance).toMatchObject({ provider: "typesafe", version: "routing-v1" });
    const state = sent[0]?.state;
    const questions = sent[0]?.questions ?? {};
    expect(state).toEqual({
      transaction_types: ["pay_change", "overtime"],
      teams: ["Payroll Operations", "Employee Services"],
    });
    expect(Object.keys((questions.type_1?.criteria as object | undefined) ?? {})).toEqual([
      "Payroll Operations",
      "Employee Services",
      "none",
    ]);
  });
});
