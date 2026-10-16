import { describe, expect, it } from "vitest";
import { providerStatus } from "../health/provider-status.js";
import { loadAiEnv } from "./env.js";

const token = "test-token-0123456789";

describe("loadAiEnv", () => {
  it("requires a service token of at least 16 characters", () => {
    expect(() => loadAiEnv({})).toThrow(/AI_SERVICE_TOKEN/);
    expect(() => loadAiEnv({ AI_SERVICE_TOKEN: "short" })).toThrow(/AI_SERVICE_TOKEN/);
  });

  it("applies defaults and treats empty provider settings as unset", () => {
    const env = loadAiEnv({
      AI_SERVICE_TOKEN: token,
      TYPESAFE_API_KEY: "",
      TEXT_MODEL_API_KEY: "",
    });
    expect(env).toMatchObject({
      PORT: 3100,
      TYPESAFE_MODEL: "jev-1.13.0",
      TEXT_MODEL: "gpt-6-luna",
    });
    expect(env.TYPESAFE_API_KEY).toBeUndefined();
    expect(env.TEXT_MODEL_API_KEY).toBeUndefined();
    expect(providerStatus(env)).toEqual({ typesafe: "missing", textModel: "missing" });
  });

  it("reports the text model as configured with a base URL and an API key", () => {
    const configured = loadAiEnv({
      AI_SERVICE_TOKEN: token,
      TYPESAFE_API_KEY: "ts-key",
      TEXT_MODEL_BASE_URL: "https://hr-checks.services.ai.azure.com/openai/v1/",
      TEXT_MODEL_API_KEY: "model-key",
    });
    expect(providerStatus(configured)).toEqual({ typesafe: "configured", textModel: "configured" });
    const keyOnly = loadAiEnv({ AI_SERVICE_TOKEN: token, TEXT_MODEL_API_KEY: "model-key" });
    expect(providerStatus(keyOnly).textModel).toBe("missing");
  });
});
