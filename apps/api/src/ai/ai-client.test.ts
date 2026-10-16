import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnv } from "../config/env.js";
import { AiClient } from "./ai-client.service.js";
import { AiFailed, AiNotConfigured } from "./ai-errors.js";

const TOKEN = "test-ai-token-0123456789";
const routing = {
  owners: [{ type: "pay_change", team: "Payroll Operations", probability: 0.9 }],
  provenance: {
    provider: "typesafe",
    model: "jev-1.13.0",
    version: "routing-v1",
    inputSha256: "0".repeat(64),
    latencyMs: 4,
  },
};
const request = { types: ["pay_change"], teams: ["Payroll Operations"] };

describe("the AI client", () => {
  let close: (() => void) | undefined;
  afterEach(() => close?.());

  /** A stand-in AI service answering every request with `status` and `body`. */
  async function service(status: number, body: unknown) {
    const seen: Array<{ authorization: string | undefined; url: string | undefined }> = [];
    const server = createServer((incoming, outgoing) => {
      seen.push({ authorization: incoming.headers.authorization, url: incoming.url });
      outgoing.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    close = () => server.close();
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const client = new AiClient(
      loadEnv({
        DATABASE_URL: "postgres://localhost/x",
        AI_SERVICE_URL: url,
        AI_SERVICE_TOKEN: TOKEN,
      }),
    );
    return { client, seen };
  }

  it("says AI isn't set up without a service, or when the service has no provider key", async () => {
    const bare = new AiClient(loadEnv({ DATABASE_URL: "postgres://localhost/x" }));
    await expect(bare.proposeRouting(request)).rejects.toBeInstanceOf(AiNotConfigured);
    const { client } = await service(503, {
      code: "provider_not_configured",
      params: { provider: "typesafe" },
    });
    await expect(client.proposeRouting(request)).rejects.toBeInstanceOf(AiNotConfigured);
  });

  it("reports a failing service, an unexpected answer and an unreachable one as failed", async () => {
    const failing = await service(502, { code: "provider_failed", params: {} });
    await expect(failing.client.proposeRouting(request)).rejects.toBeInstanceOf(AiFailed);
    close?.();
    const odd = await service(200, { owners: "none" });
    await expect(odd.client.proposeRouting(request)).rejects.toBeInstanceOf(AiFailed);
    close?.();
    const gone = new AiClient(
      loadEnv({
        DATABASE_URL: "postgres://localhost/x",
        AI_SERVICE_URL: "http://127.0.0.1:9",
        AI_SERVICE_TOKEN: TOKEN,
      }),
    );
    await expect(gone.proposeRouting(request)).rejects.toBeInstanceOf(AiFailed);
  });

  it("sends the service token and returns the parsed answer", async () => {
    const { client, seen } = await service(200, routing);
    await expect(client.proposeRouting(request)).resolves.toEqual(routing);
    expect(seen).toEqual([{ authorization: `Bearer ${TOKEN}`, url: "/v1/routing/propose" }]);
  });
});
