import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./test-app.js";

describe("health and errors", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it("reports ok when the database is reachable", async () => {
    const response = await t.http().get("/api/v1/health").expect(200);
    expect(response.body).toEqual({ status: "ok", db: "ok", ai: "not_configured" });
  });

  it("answers the liveness probe even when the database is down", async () => {
    await t.dataSource.destroy();
    try {
      await t.http().get("/api/v1/health/live").expect(200, { status: "ok" });
      await t.http().get("/api/v1/health").expect(503);
    } finally {
      await t.dataSource.initialize();
    }
  });

  it("returns { code, params } for unknown routes", async () => {
    const response = await t.http().get("/api/v1/does-not-exist").expect(404);
    expect(response.body).toEqual({ code: "not_found", params: {} });
  });
});
