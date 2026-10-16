import { HttpException } from "@nestjs/common";

export type Provider = "typesafe" | "text_model";

/** No key for the provider: `api` falls back without retrying. */
export function notConfigured(provider: Provider): HttpException {
  return new HttpException({ code: "provider_not_configured", params: { provider } }, 503);
}

/** The provider failed or answered unexpectedly: `api` may retry, then falls back. */
export function providerFailed(provider: Provider, reason: string): HttpException {
  return new HttpException({ code: "provider_failed", params: { provider, reason } }, 502);
}

/**
 * What a provider error says about itself (its class, HTTP status and error code, such as
 * DeploymentError), never the data sent.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error";
  const { status, code } = error as { status?: unknown; code?: unknown };
  const details = [
    typeof status === "number" ? `status ${status}` : null,
    typeof code === "string" && code !== "" ? code : null,
  ].filter((detail) => detail !== null);
  return details.length > 0 ? `${error.name} (${details.join(", ")})` : error.name;
}
