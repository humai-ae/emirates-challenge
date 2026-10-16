import { HttpException } from "@nestjs/common";

export type Provider = "typesafe" | "foundry";

/** No key for the provider: `api` falls back without retrying. */
export function notConfigured(provider: Provider): HttpException {
  return new HttpException({ code: "provider_not_configured", params: { provider } }, 503);
}

/** The provider failed or answered unexpectedly: `api` may retry, then falls back. */
export function providerFailed(provider: Provider, reason: string): HttpException {
  return new HttpException({ code: "provider_failed", params: { provider, reason } }, 502);
}

/** What a provider error says about itself (its class and HTTP status), never the data sent. */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error";
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? `${error.name} (status ${status})` : error.name;
}
