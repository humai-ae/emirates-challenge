import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnv } from "../config/env.js";
import { AiClient } from "./ai-client.service.js";
import { AiFailed, AiNotConfigured, AiRefused } from "./ai-errors.js";

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

  it("reports a request the service refuses as refused, so it isn't sent again", async () => {
    const { client } = await service(400, { code: "validation_failed", params: {} });
    const refused = client.proposeRouting(request);
    await expect(refused).rejects.toBeInstanceOf(AiRefused);
    await expect(refused).rejects.toBeInstanceOf(AiFailed);
  });

  it("says what the AI service can do, and when it isn't there", async () => {
    const { client, seen } = await service(200, {
      status: "ok",
      providers: { typesafe: "configured", textModel: "missing" },
    });
    expect(await client.providers()).toEqual({ reachable: true, typesafe: true, textModel: false });
    expect(seen).toEqual([{ authorization: `Bearer ${TOKEN}`, url: "/health" }]);
    const gone = new AiClient(
      loadEnv({
        DATABASE_URL: "postgres://localhost/x",
        AI_SERVICE_URL: "http://127.0.0.1:9",
        AI_SERVICE_TOKEN: TOKEN,
      }),
    );
    expect(await gone.providers()).toEqual({ reachable: false, typesafe: false, textModel: false });
    const bare = new AiClient(loadEnv({ DATABASE_URL: "postgres://localhost/x" }));
    expect(await bare.providers()).toBeNull();
  });

  it("posts judgments and explanations and checks the answers against the contract", async () => {
    const provenance = { ...routing.provenance, version: "judgment-v1" };
    const answer = { key: "k", specific: 0.1, placeholder: 0.9, accept: 0.05, enough: 0.95 };
    const judging = await service(200, { answers: [answer], provenance });
    const judged = await judging.client.judge({
      rule: { id: "R-07", text: "Justifications must give a clear business reason." },
      items: [
        { key: "k", field: "justification", text: "as discussed", type: null, amountBand: null },
      ],
    });
    expect(judged.answers).toEqual([answer]);
    expect(judging.seen[0]?.url).toBe("/v1/judgments/evaluate");
    close?.();
    // An explanation answer without its rejected texts isn't the contract.
    const explaining = await service(200, {
      en: null,
      ar: null,
      verification: { explanation: null, fix: null, arabic: null },
      provenance: { ...provenance, provider: "text_model", version: "explain-v1" },
    });
    await expect(
      explaining.client.explain({
        kind: "rule_break",
        rule: { id: "R-01", title: "Large allowance changes", text: "Need a Grade 10 approver." },
        transactionId: "TX-000006",
        evidence: [{ field: "amount", value: "16200", condition: "> 10000" }],
        severity: "High",
        team: null,
        action: { en: "Get approval.", ar: "احصل على اعتماد." },
        standard: { en: "The amount 16,200 is over 10,000.", ar: "المبلغ 16,200 أكثر من 10,000." },
        judgment: null,
        people: [],
      }),
    ).rejects.toThrow(/doesn't match the contract/);
  });
});
