import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./test-app.js";

const TOKEN = "integration-token-0123456789";

function startFakeAi(): Promise<{ server: Server; url: string }> {
  const server = createServer((request, response) => {
    if (request.url === "/health" && request.headers.authorization === `Bearer ${TOKEN}`) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({ status: "ok", providers: { typesafe: "missing", textModel: "missing" } }),
      );
      return;
    }
    response.writeHead(401).end();
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

describe("health reports the AI service", () => {
  let fake: { server: Server; url: string };
  beforeAll(async () => {
    fake = await startFakeAi();
  });
  afterAll(() => {
    fake.server.close();
  });

  it("is ok when the AI service answers with the right token", async () => {
    const t: TestApp = await createTestApp({ AI_SERVICE_URL: fake.url, AI_SERVICE_TOKEN: TOKEN });
    const response = await t.http().get("/api/v1/health").expect(200);
    expect(response.body).toEqual({ status: "ok", db: "ok", ai: "ok" });
    await t.close();
  });

  it("is degraded when the AI service rejects the token", async () => {
    const t = await createTestApp({
      AI_SERVICE_URL: fake.url,
      AI_SERVICE_TOKEN: "wrong-token-0123456789",
    });
    const response = await t.http().get("/api/v1/health").expect(200);
    expect(response.body).toEqual({ status: "degraded", db: "ok", ai: "unreachable" });
    await t.close();
  });

  it("is degraded when nothing is listening", async () => {
    const t = await createTestApp({
      AI_SERVICE_URL: "http://127.0.0.1:9",
      AI_SERVICE_TOKEN: TOKEN,
    });
    const response = await t.http().get("/api/v1/health").expect(200);
    expect(response.body.ai).toBe("unreachable");
    await t.close();
  });
});
