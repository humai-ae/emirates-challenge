import { randomBytes, type ScryptOptions, scrypt, timingSafeEqual } from "node:crypto";

/** OWASP-equivalent scrypt setting (2^15 memory cost, 3 lanes), stored with every hash. */
const COST = { N: 2 ** 15, r: 8, p: 3 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
/** 128 × N × r is exactly Node's default 32 MiB limit, so allow headroom. */
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, { ...options, maxmem: MAX_MEMORY }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** `scrypt$N$r$p$salt$key`, base64; never contains the password. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, KEY_LENGTH, COST);
  return ["scrypt", COST.N, COST.r, COST.p, salt.toString("base64"), key.toString("base64")].join(
    "$",
  );
}

/** True only for the right password. A stored value this code cannot read answers false. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (![N, r, p].every((value) => Number.isSafeInteger(value) && value > 0)) return false;
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  if (salt.length === 0 || expected.length === 0) return false;
  try {
    const actual = await derive(password, salt, expected.length, { N, r, p });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

let throwaway: Promise<string> | undefined;

/** One verification's worth of work, so an unknown email takes as long as a wrong password. */
export async function burnVerification(password: string): Promise<void> {
  throwaway ??= hashPassword(randomBytes(SALT_LENGTH).toString("hex"));
  await verifyPassword(password, await throwaway);
}
