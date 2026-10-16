import { describe, expect, it } from "vitest";
import { loadAiEnv } from "../config/env.js";
import { textModelClient } from "./text-model.js";

const env = (values: Record<string, string>) =>
  loadAiEnv({
    AI_SERVICE_TOKEN: "test-token-0123456789",
    TEXT_MODEL_API_KEY: "key",
    ...values,
  });

describe("the text model client", () => {
  it("talks to any OpenAI-compatible API at its base URL", () => {
    expect(
      textModelClient(env({ TEXT_MODEL_BASE_URL: "https://api.example.test/v1" }))?.baseURL,
    ).toBe("https://api.example.test/v1");
  });

  it("completes a Microsoft Foundry resource address to its OpenAI endpoint", () => {
    const baseOf = (url: string) => textModelClient(env({ TEXT_MODEL_BASE_URL: url }))?.baseURL;
    expect(baseOf("https://hr-checks.services.ai.azure.com")).toBe(
      "https://hr-checks.services.ai.azure.com/openai/v1/",
    );
    expect(baseOf("https://hr-checks.openai.azure.com/")).toBe(
      "https://hr-checks.openai.azure.com/openai/v1/",
    );
    expect(baseOf("https://hr-checks.services.ai.azure.com/api/projects/hr")).toBe(
      "https://hr-checks.services.ai.azure.com/openai/v1/",
    );
    expect(baseOf("https://hr-checks.services.ai.azure.com/openai/v1/")).toBe(
      "https://hr-checks.services.ai.azure.com/openai/v1/",
    );
  });

  it("is off without a key or a base URL", () => {
    expect(
      textModelClient(
        env({ TEXT_MODEL_API_KEY: "", TEXT_MODEL_BASE_URL: "https://api.example.test/v1" }),
      ),
    ).toBeNull();
    expect(textModelClient(env({}))).toBeNull();
  });
});
