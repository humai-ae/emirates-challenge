import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";

const token = "test-token-0123456789";

describe("ai service", () => {
  let app: INestApplication;
  beforeAll(async () => {
    Object.assign(process.env, {
      AI_SERVICE_TOKEN: token,
      TYPESAFE_API_KEY: "ts-key",
      ANTHROPIC_FOUNDRY_API_KEY: "",
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects requests without the service token", async () => {
    await request(app.getHttpServer()).get("/health").expect(401);
    await request(app.getHttpServer())
      .get("/health")
      .set("Authorization", "Bearer wrong-token-0123456789")
      .expect(401);
  });

  it("reports which providers are configured", async () => {
    const response = await request(app.getHttpServer())
      .get("/health")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(response.body).toEqual({
      status: "ok",
      providers: { typesafe: "configured", claude: "missing" },
    });
  });
});
