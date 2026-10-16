import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import type { AiDraftDecisions, AiDraftRuleRequest, AiRoutingRequest } from "@hrcc/shared";

export const AI_TOKEN = "test-ai-token-0123456789";

type Failure = "fail" | "not_configured" | "refuse";
type Owners = Array<{ type: string; team: string | null; probability: number }>;

export interface FakeAi {
  url: string;
  /** Every request in order, with its path and body. */
  received: Array<{ path: string; body: Record<string, unknown> }>;
  draft: (request: AiDraftRuleRequest) => AiDraftDecisions | Failure;
  action: () => { en: string; ar: string } | Failure;
  routing: (request: AiRoutingRequest) => Owners | Failure;
  /** Drafting requests wait from now until `release()`. */
  hold: () => void;
  release: () => void;
  close: () => Promise<void>;
}

const provenance = (provider: "typesafe" | "text_model", version: string) => ({
  provider,
  model: provider === "typesafe" ? "jev-test" : "text-model-test",
  version,
  inputSha256: "0".repeat(64),
  latencyMs: 5,
});

/** Answers that fit nothing; tests and `synthetic` set what they are about. */
export function decisions(overrides: Partial<AiDraftDecisions> = {}): AiDraftDecisions {
  const unset = { value: null, probability: 0.99 };
  return {
    presets: [{ none_fits: 0.9 }, { none_fits: 0.9 }],
    amount: unset,
    grade: unset,
    days: unset,
    count: unset,
    operator: { value: ">", probability: 0.6 },
    per: { value: "employee", probability: 0.6 },
    approver: { value: "any", probability: 0.6 },
    reach: { value: "reporting_line", probability: 0.6 },
    numberField: unset,
    textField: unset,
    anyField: unset,
    everyType: 0.9,
    sameAmount: 0.3,
    requesterToo: 0.1,
    types: {},
    documents: {},
    severity: { value: "Medium", probability: 0.7 },
    ...overrides,
  };
}

/** Jev's answers for the synthetic policy's grade, requester and documents rules; none fits the rest. */
export function synthetic(request: AiDraftRuleRequest): AiDraftDecisions {
  const text = request.text.toLowerCase();
  const sure = <T>(value: T) => ({ value, probability: 0.95 });
  const only = (types: string[]) => ({
    everyType: 0.05,
    types: Object.fromEntries(
      request.vocabulary.types.map((type) => [type, types.includes(type) ? 0.95 : 0.03]),
    ),
  });
  if (text.includes("grade")) {
    return decisions({
      presets: [{ approver_min_grade: 0.92 }, { approver_min_grade: 0.88 }],
      amount: sure(request.candidates.amounts[0] ?? null),
      grade: sure(request.candidates.grades[0] ?? null),
      severity: { value: "High", probability: 0.9 },
      ...only(["allowance_change"]),
    });
  }
  if (text.includes("requests a transaction")) {
    return decisions({
      presets: [{ requester_not_approver: 0.9 }, { requester_not_approver: 0.86 }],
      everyType: 0.95,
    });
  }
  if (text.includes("attached")) {
    return decisions({
      presets: [{ documents_present: 0.9 }, { documents_present: 0.9 }],
      documents: Object.fromEntries(
        request.vocabulary.documents.map((document) => [
          document,
          ["resignation_letter", "clearance_form"].includes(document) ? 0.95 : 0.02,
        ]),
      ),
      ...only(["exit"]),
    });
  }
  return decisions();
}

async function read(incoming: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of incoming) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
}

/** A stand-in for apps/ai on a free local port, with the service token checked. */
export async function startFakeAi(): Promise<FakeAi> {
  let gate = Promise.resolve();
  let open = () => {};
  const fake: FakeAi = {
    url: "",
    received: [],
    draft: synthetic,
    action: () => ({
      en: "Hold the transaction until it is approved as the rule says.",
      ar: "أوقف المعاملة حتى تُعتمد كما تنص القاعدة.",
    }),
    routing: (request) =>
      request.types.map((type) => ({ type, team: request.teams[0] ?? null, probability: 0.8 })),
    hold: () => {
      gate = new Promise((resolve) => {
        open = resolve;
      });
    },
    release: () => open(),
    close: async () => {},
  };
  const server = createServer(async (incoming, outgoing) => {
    const path = incoming.url ?? "";
    const body = await read(incoming);
    fake.received.push({ path, body });
    const send = (status: number, payload: unknown) =>
      outgoing
        .writeHead(status, { "content-type": "application/json" })
        .end(JSON.stringify(payload));
    if (incoming.headers.authorization !== `Bearer ${AI_TOKEN}`) return send(401, {});
    let reply: unknown;
    let version: string;
    let provider: "typesafe" | "text_model" = "typesafe";
    if (path === "/v1/rules/draft") {
      await gate;
      reply = fake.draft(body as unknown as AiDraftRuleRequest);
      version = "rule-draft-v1";
    } else if (path === "/v1/texts/rule-action") {
      reply = fake.action();
      [version, provider] = ["rule-action-v2", "text_model"];
    } else if (path === "/v1/routing/propose") {
      const owners = fake.routing(body as unknown as AiRoutingRequest);
      reply = typeof owners === "string" ? owners : { owners };
      version = "routing-v1";
    } else {
      return send(404, {});
    }
    if (reply === "refuse") return send(400, { code: "validation_failed", params: {} });
    if (reply === "fail")
      return send(502, { code: "provider_failed", params: { provider, reason: "request_failed" } });
    if (reply === "not_configured")
      return send(503, { code: "provider_not_configured", params: { provider } });
    return send(200, { ...(reply as object), provenance: provenance(provider, version) });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fake.close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return fake;
}
