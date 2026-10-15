import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // Needs a running Supabase stack: `pnpm --filter @hrcc/api test:storage`.
    exclude: [...configDefaults.exclude, "test/storage/**"],
    globalSetup: ["./test/global-setup.ts"],
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
