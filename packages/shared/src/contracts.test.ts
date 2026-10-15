import { describe, expect, it } from "vitest";
import {
  AuditEventSchema,
  AuditListQuerySchema,
  CreateUserRequestSchema,
  directionOf,
  IntegrityResultSchema,
  LoginRequestSchema,
  ManagedUserSchema,
  PasswordSchema,
  RoleSchema,
  UpdatePreferencesRequestSchema,
  UserSchema,
} from "./index.js";

const user = {
  id: "8f0f4b8e-4a52-4f7e-9a39-1d5f6c0e2a11",
  email: "priya.nair@emirates.test",
  displayName: "Priya Nair",
  role: "lead",
  locale: "ar",
  team: {
    id: "1c9e7f40-2b8d-4b5a-8e61-0f3c2d4b5a69",
    nameEn: "Payroll & Compensation",
    nameAr: "الرواتب والتعويضات",
  },
  mustChangePassword: false,
};

/** `path:message` for every issue, so a test can see which translation key each field got. */
function messages(result: {
  error?: { issues: Array<{ path: PropertyKey[]; message: string }> };
}): string[] {
  return (result.error?.issues ?? []).map(
    (issue) => `${issue.path.map(String).join(".")}:${issue.message}`,
  );
}

describe("contracts", () => {
  it("accepts the four roles only", () => {
    expect(RoleSchema.options).toEqual(["admin", "analyst", "lead", "auditor"]);
    expect(RoleSchema.safeParse("superuser").success).toBe(false);
  });

  it("parses a user with a team", () => {
    expect(UserSchema.parse(user)).toEqual(user);
  });

  it("parses a managed user with its status", () => {
    const managed = {
      ...user,
      isActive: true,
      isDemo: true,
      createdAt: "2026-10-15T08:00:00.000Z",
    };
    expect(ManagedUserSchema.parse(managed)).toEqual(managed);
  });

  it("trims and lower-cases the sign-in email before checking it", () => {
    expect(
      LoginRequestSchema.parse({ email: "  Layla.Haddad@EMIRATES.test ", password: "x" }),
    ).toEqual({ email: "layla.haddad@emirates.test", password: "x" });
    expect(messages(LoginRequestSchema.safeParse({ email: "layla", password: "" }))).toEqual([
      "email:email_invalid",
      "password:required",
    ]);
  });

  it("enforces the password policy with translation keys as messages", () => {
    expect(messages(PasswordSchema.safeParse("a".repeat(11)))).toEqual([":password_too_short"]);
    expect(PasswordSchema.safeParse("a".repeat(12)).success).toBe(true);
    expect(messages(PasswordSchema.safeParse("a".repeat(129)))).toEqual([":password_too_long"]);
  });

  it("requires a team for team leads and only for them", () => {
    const base = {
      email: "sara.ali@emirates.test",
      displayName: "Sara Ali",
      locale: "en",
      password: "temporary-pass-1",
    };
    const teamId = "1c9e7f40-2b8d-4b5a-8e61-0f3c2d4b5a69";
    expect(
      messages(CreateUserRequestSchema.safeParse({ ...base, role: "lead", teamId: null })),
    ).toEqual(["teamId:team_required"]);
    expect(
      messages(CreateUserRequestSchema.safeParse({ ...base, role: "analyst", teamId })),
    ).toEqual(["teamId:team_only_for_leads"]);
    expect(CreateUserRequestSchema.parse({ ...base, role: "lead", teamId }).teamId).toBe(teamId);
  });

  it("rejects unknown keys on request bodies", () => {
    expect(
      LoginRequestSchema.safeParse({ email: user.email, password: "x", role: "admin" }).success,
    ).toBe(false);
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
      actorName: "Layla Haddad",
      role: "admin",
      action: "user.create",
      objectType: "user",
      objectId: user.id,
      before: null,
      after: { email: "sara.ali@emirates.test" },
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
