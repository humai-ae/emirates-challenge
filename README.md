# HR Compliance Checker

Checks every HR transaction against every approved policy rule, explains each exception in English and Arabic, routes it to an owner, and keeps a tamper-evident audit trail. Built for the Emirates Group HR compliance challenge. **Synthetic data only.**

## Layout

| Path | What |
|---|---|
| `apps/api` | NestJS 12 + TypeORM + PostgreSQL: auth, audit log, (later) rules, runs, flags |
| `apps/ai` | Internal AI service (TypeSafe Jev + Claude on Microsoft Foundry); only `api` can call it |
| `apps/web` | Vite + React 19 + TanStack: analyst, ops team lead, internal auditor |
| `apps/admin` | Vite + React 19 + TanStack: admin console, served at `/admin/` |
| `packages/shared` | Zod 4 contracts and the typed API client |
| `packages/ui` | Design system, EN/AR i18n, right-to-left support |
| `tools/e2e` | Playwright smoke tests |
| `infra` | Dockerfiles, Caddyfile, Compose |

## Prerequisites

- Node 24.15+ (`nvm install 24 && nvm use 24`)
- pnpm 12 (`corepack enable` on Node 24, or `npm install -g pnpm@12.11.2`)
- Docker (Postgres, integration tests and the full stack)

## Run the whole stack

```bash
docker compose -f infra/compose.yaml up --build
```

Open http://localhost:8080 and pick a demo user.

| Demo user | Role |
|---|---|
| Layla Haddad | Admin |
| Omar Siddiqui | Compliance analyst |
| Priya Nair | Ops team lead, Payroll & Compensation |
| Ahmed Rahman | Ops team lead, Onboarding |
| Daniel Mensah | Internal auditor |

AI providers are optional at this stage. To configure them, set `TYPESAFE_API_KEY`, `ANTHROPIC_FOUNDRY_RESOURCE` and `ANTHROPIC_FOUNDRY_API_KEY` in your shell before `docker compose up`.

## Develop

```bash
pnpm install
docker compose -f infra/compose.yaml up -d postgres
cp apps/api/.env.example apps/api/.env
cp apps/ai/.env.example apps/ai/.env
pnpm turbo run build --filter=@hrcc/api... && pnpm --filter @hrcc/api db:migrate && pnpm --filter @hrcc/api db:seed
pnpm dev
```

- Web: http://localhost:5173 (analyst, lead, auditor; sign-in)
- Admin: http://localhost:5174/admin/
- API: http://localhost:3000/api/v1/health · AI service: http://localhost:3100 (bearer token required)

## Hosting the stack

The Compose stack serves plain HTTP on port 8080. Behind an HTTPS terminator (any hosted deployment), set these in the environment before `docker compose up`:

| Variable | Set to | Why |
|---|---|---|
| `COOKIE_SECURE` | `true` | The session cookie gets the `Secure` flag. Leave `false` only for the local plain-HTTP stack. |
| `AI_SERVICE_TOKEN` | a long random value (16+ characters) | Shared secret between `api` and `ai`. The default in `compose.yaml` is for local use only. |
| `SITE_ADDRESS` | nothing (the Caddyfile defaults to `:80`) | Caddy serves plain HTTP inside the container; the HTTPS terminator in front of it handles certificates. |

## Hosted database (Supabase)

The hosted deployment uses a Supabase project as its Postgres database. Local development and tests use Docker Postgres.

- `DATABASE_URL`: the project's **Session pooler** connection string (Project Settings → Database), without `sslmode`. Session mode suits a long-running server and supports migrations.
- `DATABASE_SSL=verify` and `DATABASE_SSL_CA`: the project's CA certificate as PEM text, e.g. `DATABASE_SSL_CA="$(cat prod-ca-2021.crt)"`.
- Run `pnpm --filter @hrcc/api db:migrate` (and `db:seed` for demo users) against it.
- Every table has row-level security enabled, and Supabase's `anon` and `authenticated` roles have no access, so the Supabase Data API exposes nothing. The app connects as the table owner.

## Checks

```bash
pnpm lint        # Biome (pnpm lint:fix to format)
pnpm typecheck
pnpm turbo run test --filter='!@hrcc/e2e'   # unit + integration (needs Docker for Testcontainers)
pnpm build
pnpm --filter @hrcc/e2e test   # against the running Compose stack
```

## Notes

- Every action writes an audit event in the same database transaction. `audit_events` is append-only (database triggers) and hash-chained. Admins and auditors can verify it from the audit log screen.
- Mutating API calls need the header `x-hrcc-request: 1`. The typed client in `@hrcc/shared` adds it.
- Demo sign-in works only when `AUTH_MODE=demo`.
