import { describe, expect, it } from "vitest";
import { canonicalJson, computeEventHash, GENESIS_HASH, type HashableEvent } from "./hash.js";

const event: HashableEvent = {
  seq: 1,
  eventId: "EV-0000001",
  at: "2026-10-15T08:40:00.000Z",
  actorId: "system",
  actorName: "System",
  role: "system",
  action: "auth.sign_in",
  objectType: "user",
  objectId: "u1",
  before: null,
  after: { b: 2, a: 1 },
  reason: null,
  ai: null,
  prevHash: GENESIS_HASH,
};

describe("canonicalJson", () => {
  it("sorts keys at every depth and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [3, { z: 1, y: 2 }] } })).toBe(
      '{"a":{"c":[3,{"y":2,"z":1}]},"b":1}',
    );
  });

  it("serialises null and primitives like JSON", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson("x")).toBe('"x"');
    expect(canonicalJson(undefined)).toBe("null");
  });
});

describe("computeEventHash", () => {
  it("is a stable 64-character hex digest independent of key order", () => {
    const hash = computeEventHash(event);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(computeEventHash({ ...event, after: { a: 1, b: 2 } })).toBe(hash);
  });

  it("changes when any field or the previous hash changes", () => {
    const hash = computeEventHash(event);
    expect(computeEventHash({ ...event, reason: "edited" })).not.toBe(hash);
    expect(computeEventHash({ ...event, prevHash: "f".repeat(64) })).not.toBe(hash);
  });
});
