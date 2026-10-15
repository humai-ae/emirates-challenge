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
import { FILE_STORE } from "../src/storage/file-store.js";
import { MemoryFileStore } from "./memory-file-store.js";

/** The header every mutating request needs. */
export const CSRF = { "x-hrcc-request": "1" };

/** The password every demo account gets in a test database. */
export const TEST_PASSWORD = "test-password-0123";

export interface TestApp {
  app: INestApplication;
  dataSource: DataSource;
  databaseUrl: string;
  /** The app's file storage: an in-memory stand-in for Supabase Storage. */
  files: MemoryFileStore;
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
    AUTH_MODE: "password",
    COOKIE_SECURE: "false",
    AI_SERVICE_URL: "",
    AI_SERVICE_TOKEN: "",
    ...env,
  });
  const files = new MemoryFileStore();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FILE_STORE)
    .useValue(files)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  // Listening once lets concurrent supertest requests share the server instead of each starting and closing it.
  await app.listen(0, "127.0.0.1");
  const dataSource = app.get<DataSource>(getDataSourceToken());
  await dataSource.runMigrations();
  await seedDemo(dataSource, { password: TEST_PASSWORD });
  return {
    app,
    dataSource,
    databaseUrl,
    files,
    http: () => request(app.getHttpServer()),
    agent: () => request.agent(app.getHttpServer()),
    close: () => app.close(),
  };
}

/** A supertest agent signed in as the account with this email. */
export async function signIn(t: TestApp, email: string, password = TEST_PASSWORD) {
  const agent = t.agent();
  await agent.post("/api/v1/auth/login").set(CSRF).send({ email, password }).expect(200);
  return agent;
}
