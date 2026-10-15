import type { AuditEvent } from "@hrcc/shared";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithI18n } from "../test/render";
import { AuditLogTable, auditActionKey } from "./audit-log-table";
import { IntegrityNotice } from "./integrity-notice";

const base: Omit<AuditEvent, "seq" | "eventId" | "action" | "after"> = {
  at: "2026-10-15T08:40:00.000Z",
  actorId: "8f0f4b8e-4a52-4f7e-9a39-1d5f6c0e2a11",
  actorName: "Omar Siddiqui",
  role: "analyst",
  objectType: "user",
  objectId: "8f0f4b8e-4a52-4f7e-9a39-1d5f6c0e2a11",
  before: null,
  reason: null,
  ai: null,
  prevHash: "0".repeat(64),
  hash: "a".repeat(64),
};

const events: AuditEvent[] = [
  {
    ...base,
    seq: 2,
    eventId: "EV-0000002",
    action: "user.preferences_update",
    after: { locale: "ar" },
  },
  { ...base, seq: 1, eventId: "EV-0000001", action: "auth.sign_in", after: { method: "demo" } },
];

describe("AuditLogTable", () => {
  it("maps dotted action names to translation keys", () => {
    expect(auditActionKey("auth.sign_in")).toBe("audit.actions.auth_sign_in");
  });

  it("describes each event in English", () => {
    renderWithI18n(<AuditLogTable events={events} locale="en" />);
    const rows = screen.getAllByTestId("audit-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("changed language to العربية");
    expect(rows[1]).toHaveTextContent("signed in");
    expect(rows[1]).toHaveTextContent("Omar Siddiqui");
  });

  it("describes each event in Arabic with Latin digits", () => {
    renderWithI18n(<AuditLogTable events={events} locale="ar" />, "ar");
    const rows = screen.getAllByTestId("audit-row");
    expect(rows[1]).toHaveTextContent("سجّل الدخول");
    expect(rows[1]?.querySelector("time")?.textContent).toMatch(/\d/);
    expect(rows[1]?.querySelector("time")?.textContent).not.toMatch(/[٠-٩]/);
  });

  it("shows an empty message when there are no events", () => {
    renderWithI18n(<AuditLogTable events={[]} locale="en" />);
    expect(screen.getByText("No entries yet.")).toBeInTheDocument();
  });
});

describe("IntegrityNotice", () => {
  it("reports an intact log", () => {
    renderWithI18n(
      <IntegrityNotice result={{ ok: true, count: 12, checkedAt: "2026-10-15T08:41:00.000Z" }} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("All 12 entries are intact.");
  });

  it("names the first broken entry", () => {
    renderWithI18n(
      <IntegrityNotice
        result={{
          ok: false,
          count: 3,
          brokenAt: "EV-0000004",
          checkedAt: "2026-10-15T08:41:00.000Z",
        }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Entry EV-0000004 has been changed");
  });
});
