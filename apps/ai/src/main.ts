import { existsSync } from "node:fs";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { AI_ENV, type AiEnv } from "./config/env.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();
await app.listen(app.get<AiEnv>(AI_ENV).PORT);
