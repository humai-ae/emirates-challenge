import type { FlagStatus, User } from "@hrcc/shared";
import { describe, expect, it } from "vitest";
import { allowedActions, canRead, type GuardedFlag, isOwnFix } from "./flag-rules.js";

type Reader = Pick<User, "id" | "role" | "team">;
const team = { id: "t-payroll", nameEn: "Payroll & Compensation", nameAr: null };
const analyst: Reader = { id: "u-analyst", role: "analyst", team: null };
const lead: Reader = { id: "u-lead", role: "lead", team };
const otherLead: Reader = { id: "u-other", role: "lead", team: { ...team, id: "t-onboarding" } };
const flag = (status: FlagStatus, extra: Partial<GuardedFlag> = {}): GuardedFlag => ({
  status,
  ownerTeamId: team.id,
  assigneeId: null,
  fixById: null,
  ...extra,
});

describe("who may do what with a flag", () => {
  it("lets analysts decide flags waiting for them and check fixes", () => {
    expect(allowedActions(flag("with_analyst"), analyst)).toEqual(["confirm", "dismiss"]);
    expect(allowedActions(flag("fix_submitted", { assigneeId: "u-lead" }), analyst)).toEqual([
      "verify",
      "send_back",
    ]);
    expect(allowedActions(flag("confirmed"), analyst)).toEqual([]);
  });

  it("lets the owner team's leads assign and mark fixed", () => {
    expect(allowedActions(flag("confirmed"), lead)).toEqual(["assign"]);
    expect(allowedActions(flag("being_fixed"), lead)).toEqual(["assign", "fix"]);
    expect(allowedActions(flag("fix_submitted"), lead)).toEqual([]);
    expect(allowedActions(flag("being_fixed"), otherLead)).toEqual([]);
  });

  it("shows a lead only their team's flags, from confirmation on", () => {
    expect(canRead(flag("with_analyst"), lead)).toBe(false);
    expect(canRead(flag("dismissed"), lead)).toBe(false);
    for (const status of ["confirmed", "being_fixed", "fix_submitted", "closed"] as const) {
      expect(canRead(flag(status), lead)).toBe(true);
      expect(canRead(flag(status), otherLead)).toBe(false);
    }
    expect(canRead(flag("with_analyst"), analyst)).toBe(true);
  });

  it("never lets the fixer check their own fix", () => {
    const fixer: Reader = { id: "u-fixer", role: "analyst", team: null };
    expect(allowedActions(flag("fix_submitted", { assigneeId: "u-fixer" }), fixer)).toEqual([]);
    expect(allowedActions(flag("fix_submitted", { fixById: "u-fixer" }), fixer)).toEqual([]);
    expect(isOwnFix(flag("fix_submitted", { fixById: "u-fixer" }), fixer)).toBe(true);
  });

  it("lets admins and auditors only read", () => {
    for (const role of ["admin", "auditor"] as const) {
      const reader: Reader = { id: `u-${role}`, role, team: null };
      expect(canRead(flag("with_analyst"), reader)).toBe(true);
      expect(allowedActions(flag("with_analyst"), reader)).toEqual([]);
      expect(allowedActions(flag("fix_submitted"), reader)).toEqual([]);
    }
  });
});
