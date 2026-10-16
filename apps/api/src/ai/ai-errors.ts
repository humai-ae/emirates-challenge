/** AI isn't set up (no AI service, or no provider key): fall back without trying again. */
export class AiNotConfigured extends Error {
  constructor() {
    super("AI is not set up");
    this.name = "AiNotConfigured";
  }
}

/** The AI service or its provider failed: try again, then fall back. */
export class AiFailed extends Error {
  constructor(reason: string, options?: ErrorOptions) {
    super(`AI failed: ${reason}`, options);
    this.name = "AiFailed";
  }
}

/** The AI service refused the request (4xx): sending it again wouldn't change the answer. */
export class AiRefused extends AiFailed {
  constructor(status: number) {
    super(`the AI service refused the request (status ${status})`);
    this.name = "AiRefused";
  }
}
