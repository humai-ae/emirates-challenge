import type { Role } from "@hrcc/shared";
import type { DataSource } from "typeorm";
import { TeamEntity, UserEntity } from "./entities/index.js";

export const DEMO_TEAMS = [
  { nameEn: "Payroll & Compensation", nameAr: "الرواتب والتعويضات" },
  { nameEn: "Onboarding", nameAr: "تهيئة الموظفين الجدد" },
] as const;

export const DEMO_USERS: ReadonlyArray<{
  username: string;
  displayName: string;
  role: Role;
  team: string | null;
}> = [
  { username: "layla.haddad", displayName: "Layla Haddad", role: "admin", team: null },
  { username: "omar.siddiqui", displayName: "Omar Siddiqui", role: "analyst", team: null },
  {
    username: "priya.nair",
    displayName: "Priya Nair",
    role: "lead",
    team: "Payroll & Compensation",
  },
  { username: "ahmed.rahman", displayName: "Ahmed Rahman", role: "lead", team: "Onboarding" },
  { username: "daniel.mensah", displayName: "Daniel Mensah", role: "auditor", team: null },
];

/** Idempotent: existing teams and users (matched by name / username) are left untouched. */
export async function seedDemo(dataSource: DataSource): Promise<void> {
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
    for (const user of DEMO_USERS) {
      const teamId = user.team
        ? (teams.find((team) => team.nameEn === user.team)?.id ?? null)
        : null;
      await manager
        .createQueryBuilder()
        .insert()
        .into(UserEntity)
        .values({
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          teamId,
          locale: "en",
          isDemo: true,
        })
        .orIgnore()
        .execute();
    }
  });
}
