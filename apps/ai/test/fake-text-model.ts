import OpenAI from "openai";

type Reply = string | { refusal: string };

/**
 * A text-model client (OpenAI chat completions) whose n-th reply is `replies[n]`, the last one
 * repeating; a reply can be a refusal. Every request it sends is kept in `sent`.
 */
export function fakeTextModel(replies: Reply[]): {
  client: OpenAI;
  sent: Array<Record<string, unknown>>;
} {
  const sent: Array<Record<string, unknown>> = [];
  const fetch = async (_input: unknown, init?: RequestInit): Promise<Response> => {
    sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const reply = replies[Math.min(sent.length, replies.length) - 1] ?? "";
    const message =
      typeof reply === "string"
        ? { role: "assistant", content: reply, refusal: null }
        : { role: "assistant", content: null, refusal: reply.refusal };
    return new Response(
      JSON.stringify({
        id: `chatcmpl-${sent.length}`,
        object: "chat.completion",
        created: 1_792_540_800,
        model: "gpt-6-luna-2026-09-22",
        choices: [{ index: 0, message, finish_reason: "stop", logprobs: null }],
        usage: { prompt_tokens: 320, completion_tokens: 70, total_tokens: 390 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const client = new OpenAI({
    apiKey: "test-key",
    baseURL: "https://models.test/openai/v1/",
    fetch,
    maxRetries: 0,
  });
  return { client, sent };
}

/**
 * A text-model client that answers each request with `reply(userMessage)`, for calls made in any
 * order; a reply can also be an HTTP error. Every request it sends is kept in `sent`.
 */
export function fakeTextModelBy(reply: (user: string) => Reply | { status: number }): {
  client: OpenAI;
  sent: Array<Record<string, unknown>>;
} {
  const sent: Array<Record<string, unknown>> = [];
  const fetch = async (_input: unknown, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    sent.push(body as unknown as Record<string, unknown>);
    const answer = reply(body.messages.at(-1)?.content ?? "");
    if (typeof answer !== "string" && "status" in answer) {
      return new Response(
        JSON.stringify({ error: { message: "refused", code: "content_filter" } }),
        {
          status: answer.status,
          headers: { "content-type": "application/json" },
        },
      );
    }
    const message =
      typeof answer === "string"
        ? { role: "assistant", content: answer, refusal: null }
        : { role: "assistant", content: null, refusal: answer.refusal };
    return new Response(
      JSON.stringify({
        id: `chatcmpl-${sent.length}`,
        object: "chat.completion",
        created: 1_792_540_800,
        model: "gpt-6-luna-2026-09-22",
        choices: [{ index: 0, message, finish_reason: "stop", logprobs: null }],
        usage: { prompt_tokens: 200, completion_tokens: 30, total_tokens: 230 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const client = new OpenAI({
    apiKey: "test-key",
    baseURL: "https://models.test/openai/v1/",
    fetch,
    maxRetries: 0,
  });
  return { client, sent };
}
