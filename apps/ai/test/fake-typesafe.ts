import { TypeSafeClient } from "@typesafe-ai/sdk";

export interface SentQuestion {
  type: string;
  instructions?: unknown;
  criteria?: unknown;
}
export interface SentRequest {
  state: unknown;
  questions: Record<string, SentQuestion>;
  model?: string;
}

/** A Jev client that answers each question with `answer`; every request it sends is kept in `sent`. */
export function fakeTypeSafe(
  answer: (id: string, question: SentQuestion) => unknown,
  status = 200,
): { client: TypeSafeClient; sent: SentRequest[] } {
  const sent: SentRequest[] = [];
  const fetch = async (_url: string, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as SentRequest;
    sent.push(body);
    const headers = { "content-type": "application/json" };
    if (status !== 200) {
      return new Response(JSON.stringify({ error: "overloaded" }), { status, headers });
    }
    const answers = Object.fromEntries(
      Object.entries(body.questions).map(([id, question]) => [id, answer(id, question)]),
    );
    return new Response(
      JSON.stringify({
        model: "jev-1.13.0",
        answers,
        usage: { input_tokens: 900, output_tokens: 40 },
      }),
      { status: 200, headers },
    );
  };
  const client = new TypeSafeClient({
    apiKey: "test-key",
    fetch,
    compression: false,
    retry: { maxRetries: 0 },
  });
  return { client, sent };
}

/** A Choice answer picking `label` with probability `p`, the rest spread over the other labels. */
export function picks(question: SentQuestion, label: string, p = 0.9) {
  const labels = Object.keys(question.criteria as Record<string, unknown>);
  const rest = labels.length > 1 ? (1 - p) / (labels.length - 1) : 0;
  return {
    type: "choice",
    choice: label,
    confidence: p,
    probabilities: Object.fromEntries(labels.map((item) => [item, item === label ? p : rest])),
  };
}

/** The last option of a Choice: "not stated" for value questions. */
export const lastOption = (question: SentQuestion) =>
  Object.keys(question.criteria as Record<string, unknown>).at(-1) ?? "";
