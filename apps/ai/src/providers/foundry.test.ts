import { describe, expect, it } from "vitest";
import { loadAiEnv } from "../config/env.js";
import { foundryClient } from "./foundry.js";

const env = (values: Record<string, string>) =>
  loadAiEnv({
    AI_SERVICE_TOKEN: "test-token-0123456789",
    ANTHROPIC_FOUNDRY_API_KEY: "key",
    ...values,
  });

describe("the Claude client on Foundry", () => {
  it("builds the Anthropic endpoint from a resource name", () => {
    expect(foundryClient(env({ ANTHROPIC_FOUNDRY_RESOURCE: "hr-checks" }))?.baseURL).toBe(
      "https://hr-checks.services.ai.azure.com/anthropic/",
    );
  });

  it("takes the resource from a project URL pasted in its place", () => {
    const client = foundryClient(
      env({
        ANTHROPIC_FOUNDRY_RESOURCE: "https://hr-checks.services.ai.azure.com/api/projects/hr",
      }),
    );
    expect(client?.baseURL).toBe("https://hr-checks.services.ai.azure.com/anthropic/");
  });

  it("keeps an Anthropic base URL, and passes over an OpenAI-style one when the resource is known", () => {
    expect(
      foundryClient(env({ ANTHROPIC_FOUNDRY_BASE_URL: "https://gateway.example.test/anthropic/" }))
        ?.baseURL,
    ).toBe("https://gateway.example.test/anthropic/");
    expect(
      foundryClient(
        env({
          ANTHROPIC_FOUNDRY_BASE_URL: "https://hr-checks.openai.azure.com/openai/v1",
          ANTHROPIC_FOUNDRY_RESOURCE: "hr-checks",
        }),
      )?.baseURL,
    ).toBe("https://hr-checks.services.ai.azure.com/anthropic/");
  });

  it("is off without a key or an endpoint", () => {
    expect(foundryClient(env({ ANTHROPIC_FOUNDRY_API_KEY: "" }))).toBeNull();
    expect(foundryClient(env({}))).toBeNull();
  });
});
