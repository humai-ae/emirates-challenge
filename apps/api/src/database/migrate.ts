import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

// Imported after the .env file is loaded: data-source.ts reads the environment.
const { default: dataSource } = await import("./data-source.js");
await dataSource.initialize();
const applied = await dataSource.runMigrations({ transaction: "each" });
console.log(`Applied ${applied.length} migration(s).`);
await dataSource.destroy();
