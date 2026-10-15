import { describe, expect, it } from "vitest";
import {
  AuditEventSchema,
  AuditListQuerySchema,
  DemoLoginRequestSchema,
  directionOf,
  IntegrityResultSchema,
  RoleSchema,
  UpdatePreferencesRequestSchema,
  UserSchema,
} from "./index.js";

const user = {
  id: "8f0f4b8e-4a52-4f7e-9a39-1d5f6c0e2a11",
  username: "priya.nair",
  displayName: "Priya Nair",
  role: "lead",
  locale: "ar",
  team: {
    id: "1c9e7f40-2b8d-4b5a-8e61-0f3c2d4b5a69",
    nameEn: "Payroll & Compensation",
    nameAr: "الرواتب والتعويضات",
  },
};

describe("contracts", () => {
  it("accepts the four roles only", () => {
    expect(RoleSchema.options).toEqual(["admin", "analyst", "lead", "auditor"]);
    expect(RoleSchema.safeParse("superuser").success).toBe(false);
  });

  it("parses a user with a team", () => {
    expect(UserSchema.parse(user)).toEqual(user);
  });

  it("rejects unknown keys on request bodies", () => {
    const result = DemoLoginRequestSchema.safeParse({ userId: user.id, role: "admin" });
    expect(result.success).toBe(false);
    expect(UpdatePreferencesRequestSchema.safeParse({ locale: "fr" }).success).toBe(false);
  });

  it("maps locales to text direction", () => {
    expect(directionOf("ar")).toBe("rtl");
    expect(directionOf("en")).toBe("ltr");
  });

  it("coerces audit list query strings and applies the default limit", () => {
    expect(AuditListQuerySchema.parse({ before: "42" })).toEqual({ before: 42, limit: 50 });
    expect(AuditListQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
  });

  it("parses an audit event and an integrity result", () => {
    const event = {
      seq: 1,
      eventId: "EV-0000001",
      at: "2026-10-15T08:40:00.000Z",
      actorId: user.id,
      actorName: "Priya Nair",
      role: "lead",
      action: "auth.sign_in",
      objectType: "user",
      objectId: user.id,
      before: null,
      after: { method: "demo" },
      reason: null,
      ai: null,
      prevHash: "0".repeat(64),
      hash: "a".repeat(64),
    };
    expect(AuditEventSchema.parse(event)).toEqual(event);
    expect(
      IntegrityResultSchema.parse({
        ok: false,
        count: 3,
        brokenAt: "EV-0000004",
        checkedAt: "2026-10-15T08:41:00.000Z",
      }).ok,
    ).toBe(false);
  });
});
