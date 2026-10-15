import type { DataSourceOptions } from "typeorm";
import type { Env } from "../config/env.js";
import { entities } from "./entities/index.js";
import { migrations } from "./migrations/index.js";
import { sslOptions } from "./ssl.js";

export type DatabaseEnv = Pick<Env, "DATABASE_URL" | "DATABASE_SSL" | "DATABASE_SSL_CA">;

export function dataSourceOptions(env: DatabaseEnv): DataSourceOptions {
  return {
    type: "postgres",
    url: env.DATABASE_URL,
    ssl: sslOptions(env),
    uuidExtension: "pgcrypto",
    entities,
    migrations,
    migrationsTableName: "typeorm_migrations",
    synchronize: false,
  };
}
