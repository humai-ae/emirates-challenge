import type { z } from "zod";
import {
  type AuditListQueryInput,
  AuditListResponseSchema,
  IntegrityResultSchema,
} from "./audit.js";
import {
  type ChangePasswordRequest,
  CSRF_HEADER,
  type LoginRequestInput,
  MeResponseSchema,
  type UpdatePreferencesRequest,
} from "./auth.js";
import {
  type ConfirmRolesRequest,
  DatasetResponseSchema,
  DatasetsListResponseSchema,
} from "./datasets.js";
import { type ApiErrorBody, ApiErrorBodySchema } from "./errors.js";
import {
  type CreateUserRequestInput,
  ManagedUserResponseSchema,
  type ResetPasswordRequest,
  TeamsListResponseSchema,
  UsersListResponseSchema,
} from "./users.js";

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
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    schema: z.ZodType<T> | null,
    body?: unknown,
  ): Promise<T> {
    // FormData sets its own multipart Content-Type (with the boundary).
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    const headers = new Headers({ Accept: "application/json" });
    if (body !== undefined && !isForm) headers.set("Content-Type", "application/json");
    if (method !== "GET") headers.set(CSRF_HEADER, "1");
    const response = await doFetch(`${baseUrl}${path}`, {
      method,
      credentials: "same-origin",
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
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

  const datasetPath = (id: string) => `/datasets/${encodeURIComponent(id)}`;

  const userPath = (id: string, action: string) => `/users/${encodeURIComponent(id)}/${action}`;

  return {
    login: (input: LoginRequestInput) => request("POST", "/auth/login", MeResponseSchema, input),
    logout: () => request<void>("POST", "/auth/logout", null),
    getMe: () => request("GET", "/me", MeResponseSchema),
    updatePreferences: (input: UpdatePreferencesRequest) =>
      request("PATCH", "/me/preferences", MeResponseSchema, input),
    changePassword: (input: ChangePasswordRequest) =>
      request("POST", "/me/password", MeResponseSchema, input),
    listUsers: () => request("GET", "/users", UsersListResponseSchema),
    createUser: (input: CreateUserRequestInput) =>
      request("POST", "/users", ManagedUserResponseSchema, input),
    deactivateUser: (id: string) =>
      request("POST", userPath(id, "deactivate"), ManagedUserResponseSchema),
    reactivateUser: (id: string) =>
      request("POST", userPath(id, "reactivate"), ManagedUserResponseSchema),
    resetUserPassword: (id: string, input: ResetPasswordRequest) =>
      request("POST", userPath(id, "reset-password"), ManagedUserResponseSchema, input),
    listTeams: () => request("GET", "/teams", TeamsListResponseSchema),
    listDatasets: () => request("GET", "/datasets", DatasetsListResponseSchema),
    getDataset: (id: string) => request("GET", datasetPath(id), DatasetResponseSchema),
    uploadDataset: (form: FormData) => request("POST", "/datasets", DatasetResponseSchema, form),
    confirmDatasetRoles: (id: string, input: ConfirmRolesRequest) =>
      request("PATCH", `${datasetPath(id)}/columns`, DatasetResponseSchema, input),
    deleteDataset: (id: string) => request("DELETE", datasetPath(id), DatasetResponseSchema),
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
