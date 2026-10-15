import "reflect-metadata";
import type { User } from "@hrcc/shared";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { ApiException } from "../common/api-exception.js";
import { ROLES_KEY } from "../common/roles.decorator.js";
import { RolesGuard } from "./roles.guard.js";

function contextFor(user: User | undefined, roles: string[] | undefined): ExecutionContext {
  const handler = () => undefined;
  if (roles) Reflect.defineMetadata(ROLES_KEY, roles, handler);
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const auditor: User = {
  id: "8f0f4b8e-4a52-4f7e-9a39-1d5f6c0e2a11",
  username: "daniel.mensah",
  displayName: "Daniel Mensah",
  role: "auditor",
  locale: "en",
  team: null,
};

describe("RolesGuard", () => {
  const guard = new RolesGuard(new Reflector());

  it("allows any signed-in user when no roles are required", () => {
    expect(guard.canActivate(contextFor(auditor, undefined))).toBe(true);
  });

  it("allows a listed role", () => {
    expect(guard.canActivate(contextFor(auditor, ["admin", "auditor"]))).toBe(true);
  });

  it("rejects other roles with 403 forbidden", () => {
    expect(() =>
      guard.canActivate(contextFor({ ...auditor, role: "analyst" }, ["admin", "auditor"])),
    ).toThrow(ApiException);
    try {
      guard.canActivate(contextFor(undefined, ["admin"]));
    } catch (error) {
      expect((error as ApiException).getStatus()).toBe(403);
      expect((error as ApiException).code).toBe("forbidden");
    }
  });
});
