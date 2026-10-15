# HR Compliance Checker

Checks every HR transaction against every approved policy rule, explains each exception in English and Arabic, routes it to an owner, and keeps a tamper-evident audit trail. Built for the Emirates Group HR compliance challenge. **Synthetic data only.**

## Layout

| Path | What |
|---|---|
| `apps/api` | NestJS 12 + TypeORM + PostgreSQL: auth, audit log, (later) rules, runs, flags |
| `apps/ai` | Internal AI service (TypeSafe Jev + Claude on Microsoft Foundry); only `api` can call it |
| `apps/web` | Vite + React 19 + TanStack: analyst, ops team lead, internal auditor |
| `apps/admin` | Vite + React 19 + TanStack: admin console, served at `/admin/` |
| `packages/engine` | Pure TypeScript: CSV reading, column profiles and roles, data issues |
| `tools/sample-data` | Generates a synthetic data pack with an answer key; `fixtures/small` feeds the tests |
| `supabase` | Supabase CLI configuration for local development (Postgres, Storage bucket) |
| `packages/shared` | Zod 4 contracts and the typed API client |
| `packages/ui` | Design system, EN/AR i18n, right-to-left support |
| `tools/e2e` | Playwright smoke tests |
| `infra` | Dockerfiles, Caddyfile, Compose |

## Prerequisites

- Node 24.15+ (`nvm install 24 && nvm use 24`)
- pnpm 12 (`corepack enable` on Node 24, or `npm install -g pnpm@12.11.2`)
- Docker (the Supabase stack, integration tests and the full stack)
- Supabase CLI 2.120+ (`brew install supabase/tap/supabase`, or see supabase.com/docs/guides/local-development)

## Run the whole stack

```bash
supabase start          # local Postgres, Storage and Studio
pnpm supabase:env       # gives Compose the local stack's secret key
docker compose -f infra/compose.yaml up --build
```

Open http://localhost:8080 and sign in with a demo account. The password is the `SEED_USER_PASSWORD` the database was first seeded with; the local default is in `infra/compose.yaml` and `apps/api/.env.example`.

| Demo account | Role |
|---|---|
| layla.haddad@emirates.test | Admin |
| omar.siddiqui@emirates.test | Compliance analyst |
| priya.nair@emirates.test | Ops team lead, Payroll & Compensation |
| ahmed.rahman@emirates.test | Ops team lead, Onboarding |
| daniel.mensah@emirates.test | Internal auditor |

`emirates.test` is a reserved domain, so no demo address can belong to a real person. Admins add more people on the Users page; each new user chooses their own password at first sign-in.

AI providers are optional at this stage. To configure them, set `TYPESAFE_API_KEY`, `ANTHROPIC_FOUNDRY_RESOURCE` and `ANTHROPIC_FOUNDRY_API_KEY` in your shell before `docker compose up`.

## Develop

```bash
pnpm install
supabase start                      # Postgres on 54322, Storage API on 54321, Studio on 54323
pnpm supabase:env                   # creates apps/api/.env pointing at the local stack
cp apps/ai/.env.example apps/ai/.env
pnpm turbo run build --filter=@hrcc/api... && pnpm --filter @hrcc/api db:migrate && pnpm --filter @hrcc/api db:seed
pnpm dev
```

- Web: http://localhost:5173 (analyst, lead, auditor; sign-in)
- Admin: http://localhost:5174/admin/
- API: http://localhost:3000/api/v1/health · AI service: http://localhost:3100 (bearer token required)
- Supabase Studio: http://127.0.0.1:54323 (tables and the `datasets` bucket). `supabase stop` keeps the data; `supabase stop --no-backup` discards it.

## Data

Admins upload `transactions.csv` and `employees.csv` on **Data → Upload data** (CSV saved as UTF-8, up to 25 MB each). The files go to the private `datasets` Storage bucket; the database keeps the rows, a profile of every column and the data issues found. Column names are never fixed: each column gets a role (transaction ID, approvers, effective date and so on), and an admin confirms the roles on the dataset's page. Deleting a dataset removes its files and rows; its record, column names and file fingerprints stay.

A synthetic pack with an answer key comes from the generator:

```bash
pnpm --filter @hrcc/sample-data generate   # 2,000 employees and 10,000 transactions, written to .context/sample-pack
pnpm --filter @hrcc/sample-data generate -- --seed 7 --employees 60 --transactions 300 --out /tmp/pack
```

## Hosting the stack

The Compose stack serves plain HTTP on port 8080. Behind an HTTPS terminator (any hosted deployment), set these in the environment before `docker compose up`:

| Variable | Set to | Why |
|---|---|---|
| `COOKIE_SECURE` | `true` | The session cookie gets the `Secure` flag. Leave `false` only for the local plain-HTTP stack. |
| `AI_SERVICE_TOKEN` | a long random value (16+ characters) | Shared secret between `api` and `ai`. The default in `compose.yaml` is for local use only. |
| `SEED_USER_PASSWORD` | a password only you know (12+ characters) | The demo accounts get it the first time the database is seeded. |
| `SITE_ADDRESS` | nothing (the Caddyfile defaults to `:80`) | Caddy serves plain HTTP inside the container; the HTTPS terminator in front of it handles certificates. |
| `SUPABASE_URL` | the project URL | Where uploaded files are kept (Supabase Storage). |
| `SUPABASE_SECRET_KEY` | a secret key from Project Settings → API Keys (or the legacy `service_role` key) | Only the API uses it. It bypasses row-level security, so keep it on the server. |

## Hosted Supabase

Local development runs the Supabase CLI stack; a hosted deployment uses a Supabase project for the same two things: the Postgres database and file storage. Integration tests use their own disposable Postgres container.

- `DATABASE_URL`: the project's **Session pooler** connection string (Project Settings → Database), without `sslmode`. Session mode suits a long-running server and supports migrations.
- `DATABASE_SSL=verify` and `DATABASE_SSL_CA`: the project's CA certificate as PEM text, e.g. `DATABASE_SSL_CA="$(cat prod-ca-2021.crt)"`.
- Run `pnpm --filter @hrcc/api db:migrate` (and `db:seed` for demo users) against it.
- Create a private Storage bucket named `datasets` (Storage → New bucket): file size limit 25 MB, allowed MIME type `text/csv`. Uploaded files go there; the database keeps each file's name, size and SHA-256.
- Every table has row-level security enabled, and Supabase's `anon` and `authenticated` roles have no access, so the Supabase Data API exposes nothing. The app connects as the table owner.

## Checks

```bash
pnpm lint        # Biome (pnpm lint:fix to format)
pnpm typecheck
pnpm turbo run test --filter='!@hrcc/e2e'   # unit + integration (needs Docker for Testcontainers)
pnpm --filter @hrcc/api test:storage   # the Storage adapter against the local Supabase stack
pnpm build
pnpm --filter @hrcc/e2e test   # against the running Compose stack
```

## Notes

- Every action writes an audit event in the same database transaction. `audit_events` is append-only (database triggers) and hash-chained. Admins and auditors can verify it from the audit log screen.
- Mutating API calls need the header `x-hrcc-request: 1`. The typed client in `@hrcc/shared` adds it.
- Sign-in uses email and password (`AUTH_MODE=password`). `AUTH_MODE=oidc` turns password sign-in off; organisation sign-in comes later.
