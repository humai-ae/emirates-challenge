import { type FlagAction, type FlagStatus, TEAM_FLAG_STATUSES, type User } from "@hrcc/shared";
import type { FlagEntity } from "../database/entities/index.js";

/** What the guards need of a flag. */
export interface GuardedFlag {
  status: FlagStatus;
  ownerTeamId: string | null;
  assigneeId: string | null;
  /** Who submitted the latest fix. */
  fixById: string | null;
}

type Reader = Pick<User, "id" | "role" | "team">;

export function guardOf(flag: FlagEntity): GuardedFlag {
  return {
    status: flag.status,
    ownerTeamId: flag.ownerTeamId,
    assigneeId: flag.assigneeId,
    fixById: flag.fix?.byId ?? null,
  };
}

/** Everyone but leads reads every flag; a lead reads their team's flags from confirmation on. */
export function canRead(flag: GuardedFlag, user: Pick<User, "role" | "team">): boolean {
  if (user.role !== "lead") return true;
  return (
    user.team !== null &&
    flag.ownerTeamId === user.team.id &&
    TEAM_FLAG_STATUSES.includes(flag.status)
  );
}

/** Separation of duties: whoever was given the fix, or submitted it, can't be the one to check it. */
export function isOwnFix(flag: GuardedFlag, user: Pick<User, "id">): boolean {
  return flag.assigneeId === user.id || flag.fixById === user.id;
}

/** What someone may do with a flag now. Admins and auditors only read. */
export function allowedActions(flag: GuardedFlag, user: Reader): FlagAction[] {
  if (user.role === "analyst") {
    if (flag.status === "with_analyst") return ["confirm", "dismiss"];
    if (flag.status === "fix_submitted" && !isOwnFix(flag, user)) return ["verify", "send_back"];
    return [];
  }
  if (user.role === "lead" && user.team !== null && flag.ownerTeamId === user.team.id) {
    if (flag.status === "confirmed") return ["assign"];
    if (flag.status === "being_fixed") return ["assign", "fix"];
  }
  return [];
}
