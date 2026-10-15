import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

const { default: dataSource } = await import("./data-source.js");
const { seedDemo } = await import("./demo-seed.js");
await dataSource.initialize();
await seedDemo(dataSource);
console.log("Demo teams and users are in place.");
await dataSource.destroy();
