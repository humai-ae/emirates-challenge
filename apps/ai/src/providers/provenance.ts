import { createHash } from "node:crypto";

/** The SHA-256 of a request as sent, so the audit log can refer to it without keeping it. */
export const sha256 = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
