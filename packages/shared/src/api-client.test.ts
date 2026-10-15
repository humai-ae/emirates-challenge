import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient } from "./api-client.js";

const user = {
  id: "8f0f4b8e-4a52-4f7e-9a39-1d5f6c0e2a11",
  username: "omar.siddiqui",
  displayName: "Omar Siddiqui",
  role: "analyst",
  locale: "en",
  team: null,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createApiClient", () => {
  it("sends the CSRF header and JSON body on mutations", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { user }));
    const api = createApiClient({ fetch: fetchMock });
    await api.demoLogin(user.id);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/auth/demo-login");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(new Headers(init.headers).get("x-hrcc-request")).toBe("1");
    expect(init.body).toBe(JSON.stringify({ userId: user.id }));
  });

  it("does not send the CSRF header on GET", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { user }));
    await createApiClient({ fetch: fetchMock }).getMe();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).has("x-hrcc-request")).toBe(false);
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
      .mockResolvedValue(jsonResponse(401, { code: "unauthenticated", params: {} }));
    const promise = createApiClient({ fetch: fetchMock }).getMe();
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ status: 401, body: { code: "unauthenticated" } });
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
});
