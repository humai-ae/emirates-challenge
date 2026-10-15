import type { z } from "zod";
import {
  type AuditListQueryInput,
  AuditListResponseSchema,
  IntegrityResultSchema,
} from "./audit.js";
import {
  CSRF_HEADER,
  DemoUsersResponseSchema,
  MeResponseSchema,
  type UpdatePreferencesRequest,
} from "./auth.js";
import { type ApiErrorBody, ApiErrorBodySchema } from "./errors.js";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.code);
    this.name = "ApiError";
  }
}

export interface ApiClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

function toSearch(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return params.toString();
}

export function createApiClient({ baseUrl = "/api/v1", fetch: fetchImpl }: ApiClientOptions = {}) {
  const doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis);

  async function request<T>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    schema: z.ZodType<T> | null,
    body?: unknown,
  ): Promise<T> {
    const headers = new Headers({ Accept: "application/json" });
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (method !== "GET") headers.set(CSRF_HEADER, "1");
    const response = await doFetch(`${baseUrl}${path}`, {
      method,
      credentials: "same-origin",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const json: unknown = await response.json().catch(() => null);
      const parsed = ApiErrorBodySchema.safeParse(json);
      throw new ApiError(
        response.status,
        parsed.success ? parsed.data : { code: "internal_error", params: {} },
      );
    }
    if (schema === null || response.status === 204) return undefined as T;
    return schema.parse(await response.json());
  }

  return {
    getDemoUsers: () => request("GET", "/auth/demo-users", DemoUsersResponseSchema),
    demoLogin: (userId: string) =>
      request("POST", "/auth/demo-login", MeResponseSchema, { userId }),
    logout: () => request<void>("POST", "/auth/logout", null),
    getMe: () => request("GET", "/me", MeResponseSchema),
    updatePreferences: (input: UpdatePreferencesRequest) =>
      request("PATCH", "/me/preferences", MeResponseSchema, input),
    listAudit: (query: AuditListQueryInput = {}) => {
      const search = toSearch({
        actorId: query.actorId,
        action: query.action,
        objectId: query.objectId,
        before: query.before === undefined ? undefined : Number(query.before),
        limit: query.limit === undefined ? undefined : Number(query.limit),
      });
      return request("GET", `/audit${search ? `?${search}` : ""}`, AuditListResponseSchema);
    },
    checkIntegrity: () => request("POST", "/audit/integrity-check", IntegrityResultSchema),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
