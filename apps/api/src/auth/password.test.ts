import { describe, expect, it } from "vitest";
import { burnVerification, hashPassword, verifyPassword } from "./password.js";

describe("password hashing", () => {
  it("stores the scrypt parameters, a fresh salt and the key, never the password", async () => {
    const first = await hashPassword("correct horse battery");
    const second = await hashPassword("correct horse battery");
    expect(first).toMatch(/^scrypt\$32768\$8\$3\$[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain("correct horse battery");
  });

  it("verifies the right password and rejects any other", async () => {
    const stored = await hashPassword("correct horse battery");
    await expect(verifyPassword("correct horse battery", stored)).resolves.toBe(true);
    await expect(verifyPassword("correct horse batterY", stored)).resolves.toBe(false);
    await expect(verifyPassword("", stored)).resolves.toBe(false);
  });

  it("answers false, without throwing, for stored values it cannot read", async () => {
    const unreadable = [
      "",
      "plain-text",
      "bcrypt$10$abc",
      "scrypt$x$8$3$c2FsdA==$a2V5",
      "scrypt$3$8$3$c2FsdA==$a2V5",
      "scrypt$32768$8$3$c2FsdA==$",
    ];
    for (const stored of unreadable) {
      await expect(verifyPassword("anything", stored)).resolves.toBe(false);
    }
  });

  it("can spend a verification's worth of work on an unknown account", async () => {
    await expect(burnVerification("anything")).resolves.toBeUndefined();
  });
});
