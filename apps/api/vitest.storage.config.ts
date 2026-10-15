import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// `pnpm supabase:env` writes the local stack's URL and secret key to .env.
if (existsSync(".env")) process.loadEnvFile(".env");

/** The FileStore checks against a running Supabase stack: `pnpm --filter @hrcc/api test:storage`. */
export default defineConfig({
  test: {
    include: ["test/storage/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
