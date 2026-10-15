import { existsSync } from "node:fs";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { configureApp } from "./app.setup.js";
import { ENV, type Env } from "./config/env.js";

// Modules read the environment lazily (inside providers), so loading .env here is in time.
if (existsSync(".env")) process.loadEnvFile(".env");

const app = await NestFactory.create(AppModule);
configureApp(app);
app.enableShutdownHooks();
await app.listen(app.get<Env>(ENV).PORT);
