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
  type AssignFlagRequest,
  type ConfirmFlagRequest,
  CountsResponseSchema,
  type DismissFlagRequest,
  FixChecksResponseSchema,
  type FixFlagRequest,
  FlagResponseSchema,
  type InboxQueryInput,
  InboxResponseSchema,
  QueueResponseSchema,
  type SendBackFlagRequest,
  type VerifyFlagRequest,
} from "./flags.js";
import { NoticesResponseSchema } from "./notices.js";
import {
  RoutingProposalSchema,
  RoutingResponseSchema,
  type SaveRoutingRequest,
  type TeamRequest,
  TeamResponseSchema,
} from "./routing.js";
import {
  type CreateRuleRequest,
  PolicyUploadResponseSchema,
  type PreviewRuleRequest,
  PreviewRuleResponseSchema,
  type RuleChangeRequest,
  type RuleReasonRequest,
  RuleRequestResponseSchema,
  RuleRequestsResponseSchema,
  RuleResponseSchema,
  RulesListResponseSchema,
  type UpdateDraftRequest,
} from "./rules.js";
import {
  type ConfirmMappingRequest,
  FindingFormatResponseSchema,
  RunResponseSchema,
  type RunResultsQueryInput,
  RunResultsResponseSchema,
  RunsListResponseSchema,
  type StartRunRequest,
} from "./runs.js";
import { SecondOpinionResponseSchema, SecondOpinionsResponseSchema } from "./second-opinions.js";
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
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
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

  const rulePath = (id: string, action?: string) =>
    `/rules/${encodeURIComponent(id)}${action ? `/${action}` : ""}`;

  const runPath = (id: string) => `/runs/${encodeURIComponent(id)}`;

  const flagPath = (id: string, action?: string) =>
    `/flags/${encodeURIComponent(id)}${action ? `/${action}` : ""}`;

  const opinionPath = (id: string, action?: string) =>
    `/second-opinions/${encodeURIComponent(id)}${action ? `/${action}` : ""}`;

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
    listRules: () => request("GET", "/rules", RulesListResponseSchema),
    getRule: (id: string) => request("GET", rulePath(id), RuleResponseSchema),
    uploadPolicy: (form: FormData) =>
      request("POST", "/policies", PolicyUploadResponseSchema, form),
    createRule: (input: CreateRuleRequest) => request("POST", "/rules", RuleResponseSchema, input),
    previewRule: (input: PreviewRuleRequest) =>
      request("POST", "/rules/preview", PreviewRuleResponseSchema, input),
    updateRuleDraft: (id: string, input: UpdateDraftRequest) =>
      request("PATCH", rulePath(id, "draft"), RuleResponseSchema, input),
    approveRule: (id: string, input: RuleChangeRequest) =>
      request("POST", rulePath(id, "approve"), RuleResponseSchema, input),
    rejectRule: (id: string, input: RuleReasonRequest) =>
      request("POST", rulePath(id, "reject"), RuleResponseSchema, input),
    editRule: (id: string, input: RuleChangeRequest) =>
      request("POST", rulePath(id, "edit"), RuleResponseSchema, input),
    retireRule: (id: string, input: RuleReasonRequest) =>
      request("POST", rulePath(id, "retire"), RuleResponseSchema, input),
    redraftRule: (id: string, input: RuleChangeRequest) =>
      request("POST", rulePath(id, "redraft"), RuleResponseSchema, input),
    requestRule: (input: CreateRuleRequest) =>
      request("POST", "/rule-requests", RuleRequestResponseSchema, input),
    listRuleRequests: () => request("GET", "/rule-requests", RuleRequestsResponseSchema),
    getRouting: () => request("GET", "/routing", RoutingResponseSchema),
    proposeRouting: () => request("POST", "/routing/proposal", RoutingProposalSchema, {}),
    saveRouting: (input: SaveRoutingRequest) =>
      request("PUT", "/routing", RoutingResponseSchema, input),
    createTeam: (input: TeamRequest) => request("POST", "/teams", TeamResponseSchema, input),
    updateTeam: (id: string, input: TeamRequest) =>
      request("PATCH", `/teams/${encodeURIComponent(id)}`, TeamResponseSchema, input),
    startRun: (input: Partial<StartRunRequest> = {}) =>
      request("POST", "/runs", RunResponseSchema, input),
    listRuns: () => request("GET", "/runs", RunsListResponseSchema),
    getRun: (id: string) => request("GET", runPath(id), RunResponseSchema),
    retryAiChecks: (id: string) =>
      request("POST", `${runPath(id)}/retry-ai`, RunResponseSchema, {}),
    listRunResults: (id: string, query: RunResultsQueryInput = {}) => {
      const search = toSearch({
        outcome: query.outcome,
        ruleId: query.ruleId,
        after: query.after === undefined ? undefined : Number(query.after),
        limit: query.limit === undefined ? undefined : Number(query.limit),
      });
      return request(
        "GET",
        `${runPath(id)}/results${search ? `?${search}` : ""}`,
        RunResultsResponseSchema,
      );
    },
    /** The browser downloads this itself; the session cookie goes with it. */
    runExportUrl: (id: string) => `${baseUrl}${runPath(id)}/export`,
    uploadFindingFormat: (form: FormData) =>
      request("POST", "/finding-formats", FindingFormatResponseSchema, form),
    getFindingFormat: () => request("GET", "/finding-formats/current", FindingFormatResponseSchema),
    confirmFindingMapping: (id: string, input: ConfirmMappingRequest) =>
      request(
        "PATCH",
        `/finding-formats/${encodeURIComponent(id)}/mapping`,
        FindingFormatResponseSchema,
        input,
      ),
    getInbox: (query: InboxQueryInput = {}) => {
      const search = toSearch({
        severity: query.severity,
        kind: query.kind,
        ruleId: query.ruleId,
        teamId: query.teamId,
        runId: query.runId,
        after: query.after,
        limit: query.limit === undefined ? undefined : Number(query.limit),
      });
      return request("GET", `/flags/inbox${search ? `?${search}` : ""}`, InboxResponseSchema);
    },
    getFixChecks: () => request("GET", "/flags/fix-checks", FixChecksResponseSchema),
    getQueue: () => request("GET", "/flags/queue", QueueResponseSchema),
    getFlag: (id: string) => request("GET", flagPath(id), FlagResponseSchema),
    confirmFlag: (id: string, input: ConfirmFlagRequest) =>
      request("POST", flagPath(id, "confirm"), FlagResponseSchema, input),
    dismissFlag: (id: string, input: DismissFlagRequest) =>
      request("POST", flagPath(id, "dismiss"), FlagResponseSchema, input),
    assignFlag: (id: string, input: AssignFlagRequest) =>
      request("POST", flagPath(id, "assign"), FlagResponseSchema, input),
    fixFlag: (id: string, input: FixFlagRequest) =>
      request("POST", flagPath(id, "fix"), FlagResponseSchema, input),
    verifyFlag: (id: string, input: VerifyFlagRequest) =>
      request("POST", flagPath(id, "verify"), FlagResponseSchema, input),
    sendBackFlag: (id: string, input: SendBackFlagRequest) =>
      request("POST", flagPath(id, "send-back"), FlagResponseSchema, input),
    listSecondOpinions: (runId?: string) => {
      const search = toSearch({ runId });
      return request(
        "GET",
        `/second-opinions${search ? `?${search}` : ""}`,
        SecondOpinionsResponseSchema,
      );
    },
    getSecondOpinion: (id: string) => request("GET", opinionPath(id), SecondOpinionResponseSchema),
    noteSecondOpinion: (id: string) =>
      request("POST", opinionPath(id, "noted"), SecondOpinionResponseSchema, {}),
    askRuleReview: (id: string) =>
      request("POST", opinionPath(id, "review"), SecondOpinionResponseSchema, {}),
    getCounts: () => request("GET", "/me/counts", CountsResponseSchema),
    listNotices: () => request("GET", "/notices", NoticesResponseSchema),
    readNotice: (id: string) =>
      request("POST", `/notices/${encodeURIComponent(id)}/read`, NoticesResponseSchema, {}),
    readAllNotices: () => request("POST", "/notices/read-all", NoticesResponseSchema, {}),
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
