import { createHash } from "node:crypto";

export const GENESIS_HASH = "0".repeat(64);

/** Code-unit order, so the result never depends on the machine's locale. */
function compareKeys(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** JSON with keys sorted at every depth; `undefined` values are dropped (as JSON.stringify does). */
export function canonicalJson(value: unknown): string {
  if (value === undefined || value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => compareKeys(a, b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

export interface HashableEvent {
  seq: number;
  eventId: string;
  at: string;
  actorId: string;
  actorName: string;
  role: string;
  action: string;
  objectType: string;
  objectId: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  ai: unknown;
  prevHash: string;
}

export function computeEventHash(event: HashableEvent): string {
  return createHash("sha256").update(event.prevHash).update(canonicalJson(event)).digest("hex");
}
