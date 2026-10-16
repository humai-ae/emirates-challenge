import { AnthropicFoundry } from "@anthropic-ai/foundry-sdk";

/** A Claude client whose n-th reply is `replies[n]` (the last one repeats); requests go to `sent`. */
export function fakeFoundry(replies: string[]): {
  client: AnthropicFoundry;
  sent: Array<Record<string, unknown>>;
} {
  const sent: Array<Record<string, unknown>> = [];
  const fetch = async (_input: unknown, init?: RequestInit): Promise<Response> => {
    sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const text = replies[Math.min(sent.length, replies.length) - 1] ?? "";
    return new Response(
      JSON.stringify({
        id: `msg_${sent.length}`,
        type: "message",
        role: "assistant",
        model: "claude-haiku-5-5",
        content: [{ type: "text", text }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 320, output_tokens: 70 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const client = new AnthropicFoundry({
    apiKey: "test-key",
    baseURL: "https://foundry.test/anthropic/",
    resource: "",
    fetch,
    maxRetries: 0,
  });
  return { client, sent };
}
