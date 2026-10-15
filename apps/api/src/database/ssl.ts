import type { TlsOptions } from "node:tls";
import type { Env } from "../config/env.js";

export type SslEnv = Pick<Env, "DATABASE_SSL" | "DATABASE_SSL_CA">;

/** TLS for hosted Postgres (Supabase requires it); local Docker Postgres runs without. */
export function sslOptions(env: SslEnv): false | TlsOptions {
  switch (env.DATABASE_SSL) {
    case "disable":
      return false;
    case "require":
      return { rejectUnauthorized: false };
    case "verify":
      return env.DATABASE_SSL_CA
        ? { rejectUnauthorized: true, ca: env.DATABASE_SSL_CA }
        : { rejectUnauthorized: true };
  }
}
