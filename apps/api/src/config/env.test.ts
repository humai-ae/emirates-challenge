import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

describe("loadEnv", () => {
  it("applies defaults", () => {
    const env = loadEnv({ DATABASE_URL: "postgres://x/y" });
    expect(env).toMatchObject({
      NODE_ENV: "development",
      PORT: 3000,
      AUTH_MODE: "password",
      COOKIE_SECURE: false,
      SESSION_TTL_HOURS: 12,
      JOBS_POLL_SECONDS: 2,
      DRAFT_RETRY_LIMIT: 2,
    });
    expect(env.AI_SERVICE_URL).toBeUndefined();
  });

  it("treats empty optional values as unset and parses booleans", () => {
    const env = loadEnv({
      DATABASE_URL: "postgres://x/y",
      COOKIE_SECURE: "true",
      AI_SERVICE_URL: "",
      AI_SERVICE_TOKEN: "",
    });
    expect(env.COOKIE_SECURE).toBe(true);
    expect(env.AI_SERVICE_URL).toBeUndefined();
    expect(env.AI_SERVICE_TOKEN).toBeUndefined();
  });

  it("reads TLS settings for a hosted database such as Supabase", () => {
    const env = loadEnv({
      DATABASE_URL: "postgres://x/y",
      DATABASE_SSL: "verify",
      DATABASE_SSL_CA: "PEM",
    });
    expect(env.DATABASE_SSL).toBe("verify");
    expect(env.DATABASE_SSL_CA).toBe("PEM");
    expect(loadEnv({ DATABASE_URL: "postgres://x/y" }).DATABASE_SSL).toBe("disable");
    expect(() => loadEnv({ DATABASE_URL: "postgres://x/y", DATABASE_SSL: "maybe" })).toThrow(
      /DATABASE_SSL/,
    );
  });

  it("fails with a readable message on invalid values", () => {
    expect(() => loadEnv({ DATABASE_URL: "postgres://x/y", AUTH_MODE: "magic" })).toThrow(
      /Invalid environment[\s\S]*AUTH_MODE/,
    );
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it("reads the Supabase Storage settings", () => {
    const env = loadEnv({
      DATABASE_URL: "postgres://x/y",
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SECRET_KEY: "test-secret-key-0123456789",
    });
    expect(env).toMatchObject({
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SECRET_KEY: "test-secret-key-0123456789",
      SUPABASE_STORAGE_BUCKET: "datasets",
    });
    const unset = loadEnv({
      DATABASE_URL: "postgres://x/y",
      SUPABASE_URL: "",
      SUPABASE_SECRET_KEY: "",
    });
    expect(unset.SUPABASE_URL).toBeUndefined();
    expect(unset.SUPABASE_SECRET_KEY).toBeUndefined();
    expect(() =>
      loadEnv({ DATABASE_URL: "postgres://x/y", SUPABASE_STORAGE_BUCKET: "Data Sets" }),
    ).toThrow(/SUPABASE_STORAGE_BUCKET/);
  });
});
