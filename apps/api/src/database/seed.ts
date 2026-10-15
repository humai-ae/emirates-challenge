import { existsSync } from "node:fs";
import { PasswordSchema } from "@hrcc/shared";

if (existsSync(".env")) process.loadEnvFile(".env");

const password = PasswordSchema.safeParse(process.env.SEED_USER_PASSWORD ?? "");
if (!password.success) {
  console.error("Set SEED_USER_PASSWORD (12 to 128 characters): the password demo accounts get.");
  process.exit(1);
}

// Imported after the .env file is loaded: data-source.ts reads the environment.
const { default: dataSource } = await import("./data-source.js");
const { seedDemo } = await import("./demo-seed.js");
await dataSource.initialize();
await seedDemo(dataSource, { password: password.data });
console.log("Demo teams and users are in place.");
await dataSource.destroy();
