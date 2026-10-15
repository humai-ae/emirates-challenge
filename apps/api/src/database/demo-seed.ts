import type { Role } from "@hrcc/shared";
import type { DataSource } from "typeorm";
import { hashPassword } from "../auth/password.js";
import { TeamEntity, UserEntity } from "./entities/index.js";

export const DEMO_TEAMS = [
  { nameEn: "Payroll & Compensation", nameAr: "الرواتب والتعويضات" },
  { nameEn: "Onboarding", nameAr: "تهيئة الموظفين الجدد" },
] as const;

/** A reserved domain, so no demo address can belong to a real person. */
export const DEMO_USERS: ReadonlyArray<{
  email: string;
  displayName: string;
  role: Role;
  team: string | null;
}> = [
  { email: "layla.haddad@emirates.test", displayName: "Layla Haddad", role: "admin", team: null },
  {
    email: "omar.siddiqui@emirates.test",
    displayName: "Omar Siddiqui",
    role: "analyst",
    team: null,
  },
  {
    email: "priya.nair@emirates.test",
    displayName: "Priya Nair",
    role: "lead",
    team: "Payroll & Compensation",
  },
  {
    email: "ahmed.rahman@emirates.test",
    displayName: "Ahmed Rahman",
    role: "lead",
    team: "Onboarding",
  },
  {
    email: "daniel.mensah@emirates.test",
    displayName: "Daniel Mensah",
    role: "auditor",
    team: null,
  },
];

/**
 * Idempotent. Missing teams and demo users are created; a demo user without a password gets
 * `password`; a password that is already set is never overwritten.
 */
export async function seedDemo(
  dataSource: DataSource,
  { password }: { password: string },
): Promise<void> {
  await dataSource.transaction(async (manager) => {
    for (const team of DEMO_TEAMS) {
      await manager
        .createQueryBuilder()
        .insert()
        .into(TeamEntity)
        .values({ ...team })
        .orIgnore()
        .execute();
    }
    const teams = await manager.find(TeamEntity);
    for (const demo of DEMO_USERS) {
      const existing = await manager.findOneBy(UserEntity, { email: demo.email });
      if (existing?.passwordHash) continue;
      const passwordHash = await hashPassword(password);
      if (existing) {
        await manager.update(UserEntity, { id: existing.id }, { passwordHash });
        continue;
      }
      const teamId = demo.team
        ? (teams.find((team) => team.nameEn === demo.team)?.id ?? null)
        : null;
      await manager.insert(UserEntity, {
        email: demo.email,
        displayName: demo.displayName,
        role: demo.role,
        teamId,
        locale: "en",
        isDemo: true,
        passwordHash,
      });
    }
  });
}
