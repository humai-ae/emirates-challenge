import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient } from "./api-client.js";

const user = {
  id: "8f0f4b8e-4a52-4f7e-9a39-1d5f6c0e2a11",
  email: "omar.siddiqui@emirates.test",
  displayName: "Omar Siddiqui",
  role: "analyst",
  locale: "en",
  team: null,
  mustChangePassword: false,
};
const managed = { ...user, isActive: true, isDemo: false, createdAt: "2026-10-15T08:00:00.000Z" };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createApiClient", () => {
  it("sends the CSRF header and the JSON body when signing in", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { user }));
    const api = createApiClient({ fetch: fetchMock });
    await api.login({ email: user.email, password: "secret-password" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/auth/login");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(new Headers(init.headers).get("x-hrcc-request")).toBe("1");
    expect(init.body).toBe(JSON.stringify({ email: user.email, password: "secret-password" }));
  });

  it("does not send the CSRF header on GET", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { user }));
    await createApiClient({ fetch: fetchMock }).getMe();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).has("x-hrcc-request")).toBe(false);
  });

  it("calls the user administration endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(jsonResponse(200, { user: managed })));
    const api = createApiClient({ fetch: fetchMock });
    await api.deactivateUser(managed.id);
    await api.reactivateUser(managed.id);
    await api.resetUserPassword(managed.id, { password: "reset-password-1" });
    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>;
    expect(calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      `POST /api/v1/users/${managed.id}/deactivate`,
      `POST /api/v1/users/${managed.id}/reactivate`,
      `POST /api/v1/users/${managed.id}/reset-password`,
    ]);
    const [, resetInit] = calls[2] as [string, RequestInit];
    expect(resetInit.body).toBe(JSON.stringify({ password: "reset-password-1" }));
    expect(new Headers(resetInit.headers).get("x-hrcc-request")).toBe("1");
  });

  it("lists users and teams", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { users: [managed] }))
      .mockResolvedValueOnce(jsonResponse(200, { teams: [] }));
    const api = createApiClient({ fetch: fetchMock });
    await expect(api.listUsers()).resolves.toEqual({ users: [managed] });
    await expect(api.listTeams()).resolves.toEqual({ teams: [] });
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(["/api/v1/users", "/api/v1/teams"]);
  });

  it("serialises audit list queries without undefined values", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { events: [], nextBefore: null }));
    await createApiClient({ fetch: fetchMock }).listAudit({ before: 10, limit: 25 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/audit?before=10&limit=25");
  });

  it("throws ApiError with the parsed error body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { code: "invalid_credentials", params: {} }));
    const promise = createApiClient({ fetch: fetchMock }).login({
      email: user.email,
      password: "wrong-password",
    });
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({
      status: 401,
      body: { code: "invalid_credentials" },
    });
  });

  it("falls back to internal_error when the error body is not ours", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(createApiClient({ fetch: fetchMock }).getMe()).rejects.toMatchObject({
      status: 502,
      body: { code: "internal_error", params: {} },
    });
  });

  it("resolves undefined for 204 responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(createApiClient({ fetch: fetchMock }).logout()).resolves.toBeUndefined();
  });

  it("uploads a dataset as multipart form data with the CSRF header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const form = new FormData();
    form.set("name", "Training pack");
    await createApiClient({ fetch: fetchMock }).uploadDataset(form);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/datasets");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(form);
    const headers = new Headers(init.headers);
    expect(headers.has("Content-Type")).toBe(false);
    expect(headers.get("x-hrcc-request")).toBe("1");
  });

  it("deletes a dataset with DELETE", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await createApiClient({ fetch: fetchMock }).deleteDataset(
      "5d9b5c1e-3f0a-4c8e-9a71-2b6f4e8d1c30",
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/datasets/5d9b5c1e-3f0a-4c8e-9a71-2b6f4e8d1c30");
    expect(init.method).toBe("DELETE");
  });

  it("calls the rule endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));
    const api = createApiClient({ fetch: fetchMock });
    const form = new FormData();
    await api.listRules();
    await api.getRule("R-01");
    await api.uploadPolicy(form);
    await api.createRule({ text: "The requester must not approve." });
    await api.previewRule({ preset: "requester_not_approver", values: {} });
    await api.updateRuleDraft("R-01", {
      rowVersion: 2,
      preset: "requester_not_approver",
      values: {},
      severity: "High",
      ownerTeamId: null,
      suggestedActionEn: "Fix it.",
      suggestedActionAr: "أصلحه.",
    });
    await api.approveRule("R-01", { rowVersion: 3 });
    await api.rejectRule("R-01", { rowVersion: 3, reason: "Duplicate" });
    await api.editRule("R-01", { rowVersion: 4 });
    await api.retireRule("R-01", { rowVersion: 5, reason: "Policy withdrawn" });
    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>;
    expect(calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      "GET /api/v1/rules",
      "GET /api/v1/rules/R-01",
      "POST /api/v1/policies",
      "POST /api/v1/rules",
      "POST /api/v1/rules/preview",
      "PATCH /api/v1/rules/R-01/draft",
      "POST /api/v1/rules/R-01/approve",
      "POST /api/v1/rules/R-01/reject",
      "POST /api/v1/rules/R-01/edit",
      "POST /api/v1/rules/R-01/retire",
    ]);
    expect(calls[2]?.[1].body).toBe(form);
    expect(calls[7]?.[1].body).toBe(JSON.stringify({ rowVersion: 3, reason: "Duplicate" }));
  });
});
