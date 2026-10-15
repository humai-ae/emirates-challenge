import type { ApiClient, AuditEvent } from "@hrcc/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "../test/render";
import { AuditLogPanel } from "./audit-log-panel";

function event(seq: number): AuditEvent {
  return {
    seq,
    eventId: `EV-${String(seq).padStart(7, "0")}`,
    at: "2026-10-15T08:40:00.000Z",
    actorId: "8f0f4b8e-4a52-4f7e-9a39-1d5f6c0e2a11",
    actorName: "Daniel Mensah",
    role: "auditor",
    action: "auth.sign_in",
    objectType: "user",
    objectId: "8f0f4b8e-4a52-4f7e-9a39-1d5f6c0e2a11",
    before: null,
    after: { method: "demo" },
    reason: null,
    ai: null,
    prevHash: "0".repeat(64),
    hash: "a".repeat(64),
  };
}

describe("AuditLogPanel", () => {
  it("pages through the log and runs the integrity check", async () => {
    const listAudit = vi
      .fn()
      .mockResolvedValueOnce({ events: [event(3), event(2)], nextBefore: 2 })
      .mockResolvedValueOnce({ events: [event(1)], nextBefore: null })
      // After the integrity check the list refetches from page one.
      .mockResolvedValue({ events: [event(4), event(3), event(2), event(1)], nextBefore: null });
    const checkIntegrity = vi
      .fn()
      .mockResolvedValue({ ok: true, count: 3, checkedAt: "2026-10-15T08:41:00.000Z" });
    const api = { listAudit, checkIntegrity } as unknown as ApiClient;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderWithI18n(
      <QueryClientProvider client={queryClient}>
        <AuditLogPanel api={api} locale="en" />
      </QueryClientProvider>,
    );

    expect(await screen.findAllByTestId("audit-row")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(await screen.findAllByTestId("audit-row")).toHaveLength(3);
    expect(listAudit).toHaveBeenLastCalledWith({ before: 2, limit: 50 });
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Check nothing has been changed" }));
    expect(await screen.findByRole("status")).toHaveTextContent("All 3 entries are intact.");
  });
});
