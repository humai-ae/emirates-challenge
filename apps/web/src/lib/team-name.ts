import type { Locale, TeamSummary } from "@hrcc/shared";

export function teamNameFor(team: TeamSummary | null, locale: Locale): string | null {
  if (!team) return null;
  return locale === "ar" ? (team.nameAr ?? team.nameEn) : team.nameEn;
}
