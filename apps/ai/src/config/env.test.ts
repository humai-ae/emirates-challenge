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
      ANTHROPIC_FOUNDRY_API_KEY: "",
    });
    expect(env).toMatchObject({
      PORT: 3100,
      TYPESAFE_MODEL: "jev-1.13.0",
      FOUNDRY_HAIKU_DEPLOYMENT: "claude-haiku-5-5",
    });
    expect(env.TYPESAFE_API_KEY).toBeUndefined();
    expect(providerStatus(env)).toEqual({ typesafe: "missing", claude: "missing" });
  });

  it("reports Claude as configured with a resource (or base URL) and an API key", () => {
    const byResource = loadAiEnv({
      AI_SERVICE_TOKEN: token,
      TYPESAFE_API_KEY: "ts-key",
      ANTHROPIC_FOUNDRY_RESOURCE: "hrcc-foundry",
      ANTHROPIC_FOUNDRY_API_KEY: "foundry-key",
    });
    expect(providerStatus(byResource)).toEqual({ typesafe: "configured", claude: "configured" });
    const keyOnly = loadAiEnv({
      AI_SERVICE_TOKEN: token,
      ANTHROPIC_FOUNDRY_API_KEY: "foundry-key",
    });
    expect(providerStatus(keyOnly).claude).toBe("missing");
  });
});
