import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getDataSourceToken } from "@nestjs/typeorm";
import pg from "pg";
import request from "supertest";
import type { DataSource } from "typeorm";
import { inject } from "vitest";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { seedDemo } from "../src/database/demo-seed.js";

export interface TestApp {
  app: INestApplication;
  dataSource: DataSource;
  databaseUrl: string;
  http: () => ReturnType<typeof request>;
  agent: () => ReturnType<typeof request.agent>;
  close: () => Promise<void>;
}

export async function createTestDatabase(): Promise<string> {
  const baseUrl = inject("databaseUrl");
  const name = `t_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

/** A fully configured app on a fresh, migrated and seeded database. */
export async function createTestApp(env: Record<string, string> = {}): Promise<TestApp> {
  const databaseUrl = await createTestDatabase();
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    AUTH_MODE: "demo",
    COOKIE_SECURE: "false",
    AI_SERVICE_URL: "",
    AI_SERVICE_TOKEN: "",
    ...env,
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  // Listening once lets concurrent supertest requests share the server instead of each starting and closing it.
  await app.listen(0, "127.0.0.1");
  const dataSource = app.get<DataSource>(getDataSourceToken());
  await dataSource.runMigrations();
  await seedDemo(dataSource);
  return {
    app,
    dataSource,
    databaseUrl,
    http: () => request(app.getHttpServer()),
    agent: () => request.agent(app.getHttpServer()),
    close: () => app.close(),
  };
}
