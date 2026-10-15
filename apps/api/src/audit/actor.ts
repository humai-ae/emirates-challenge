import type { User } from "@hrcc/shared";

export interface Actor {
  id: string;
  name: string;
  role: string;
}

export const SYSTEM_ACTOR: Actor = { id: "system", name: "System", role: "system" };

export function actorOf(user: User): Actor {
  return { id: user.id, name: user.displayName, role: user.role };
}
