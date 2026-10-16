# HR Compliance Checker

Checks every HR transaction against every approved policy rule, explains each exception in English and Arabic, routes it to an owner, and keeps a tamper-evident audit trail. Built for the Emirates Group HR compliance challenge. **Synthetic data only.**

## Layout

| Path | What |
|---|---|
| `apps/api` | NestJS 12 + TypeORM + PostgreSQL: auth, audit log, (later) rules, runs, flags |
| `apps/ai` | Internal AI service (TypeSafe Jev + Claude on Microsoft Foundry); only `api` can call it |
| `apps/web` | Vite + React 19 + TanStack: analyst, ops team lead, internal auditor |
| `apps/admin` | Vite + React 19 + TanStack: admin console, served at `/admin/` |
| `packages/engine` | Pure TypeScript: CSV reading, column profiles and roles, data issues; the rule-check interpreter, check presets, evaluation and preview |
| `tools/sample-data` | Generates a synthetic data pack with an answer key; `fixtures/small` feeds the tests |
| `tools/eval` | Scores findings against an answer key (precision and recall per rule); its tests gate accuracy and speed |
| `supabase` | Supabase CLI configuration for local development (Postgres, Storage bucket) |
| `packages/shared` | Zod 4 contracts and the typed API client |
| `packages/ui` | Design system, EN/AR i18n, right-to-left support |
| `tools/e2e` | Playwright smoke tests |
| `infra` | Dockerfiles, Caddyfile, Compose; `infra/azure`: Bicep templates for Azure Container Apps |
| `scripts/azure` | The rollout script the deploy workflows run, and its tests |

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

AI is optional. Without it, rules are drafted from their own words and suggested fixes use standard wording. To turn it on, set `TYPESAFE_API_KEY` (TypeSafe Jev drafts rules and suggests owner teams), and `ANTHROPIC_FOUNDRY_API_KEY` with `ANTHROPIC_FOUNDRY_RESOURCE` or `ANTHROPIC_FOUNDRY_BASE_URL` (Claude on Microsoft Foundry writes suggested fixes), in your shell before `docker compose up`, or in `apps/ai/.env` for `pnpm dev`. `TYPESAFE_MODEL` and `FOUNDRY_HAIKU_DEPLOYMENT` choose the model and deployment. The AI service is reachable only from the API, with a token.

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

## Rule checks and accuracy

Each rule runs as a check: data in a restricted expression format that `packages/engine` evaluates, never code. A check comes from a preset (an approver's grade above an amount, required documents, approval before the effective date, at most N transactions in a window, and so on) filled in with the rule's values, and it refers to the uploaded column names. Every transaction gets one outcome per rule: passed, flagged with the evidence, could not check with the missing fields named, or left for AI to judge. A preview shows what a check would flag, and its near misses, before anyone approves it.

`tools/eval` scores findings against an answer key, rule by rule. After `pnpm build`:

```bash
pnpm --filter @hrcc/eval eval -- sample --pack /tmp/pack   # the synthetic policy's checks on a generated pack
pnpm --filter @hrcc/eval eval -- score --findings findings.csv --key answer_key.csv
```

Both print precision and recall per rule, and exit with an error when a rule is below the targets: recall 95% and precision 90%. The tests run the same scoring on generated packs, check that a second run gives identical results, and time 10,000 transactions against 20 checks.

## Rules

Admins upload the policy document on **Rules → Upload policy** (`.md`, `.markdown` or `.txt`, UTF-8, up to 1 MB), or write a single rule. Load data first: rules are matched to the newest ready dataset's columns. Each heading or numbered item becomes a rule and keeps the policy's own ID (`R-01`); headings without one are numbered `R-01`, `R-02` and so on, and repeated IDs and documents without headings are reported. Rules an admin writes get their own IDs (`W-01`, `W-02`, …), so uploading the policy never changes them.

With the AI service set, every new or changed rule is drafted in the background, one at a time, and the Rules page shows the progress ("6 of 18 drafted"). TypeSafe Jev chooses the check type and its values from the amounts, grades, periods, transaction types and documents code finds in the rule's words; code then builds the check, so AI never writes it. The rule's page says how sure AI was and marks the value it was least sure of. Claude writes the suggested fix in English and Arabic; a fix that names a number the rule doesn't give is sent back once, then replaced by the standard wording. When AI isn't set up, or keeps failing, the rule is drafted from its own words instead, and the page says so; **Draft again** retries. Without the AI service, drafts are made from the rule's words straight away. A rule nothing matches is marked for the admin to choose a check type.

On the rule's page the admin sees the policy text beside the check, a sentence saying what the check does (in English and Arabic), and a live preview on the loaded data with sample flags and near misses. They edit the values, severity, owner and suggested fix, then approve or reject the draft. Editing a live rule opens a new version; the live one keeps running until the new one is approved. Rejecting and retiring need a reason. Versions are never deleted, and every change is in the audit log.

Analysts ask for rules on **Request a rule**; each request is drafted like a rule an admin writes, shows "Requested by …" in the admin's list, and the analyst sees whether it is waiting, live or rejected (with the reason).

Uploading the policy again leaves unchanged rules alone and opens a new draft for each changed one.

`pnpm --filter @hrcc/eval test` includes a check that the keyword drafts of the synthetic policy find every planted break in a generated pack.

## Teams and routing

**Teams and routing** sets the team that owns findings on each transaction type. **Suggest owners** proposes the owner teams the policy names in a table (a transaction-type column and a team column), and asks AI for the types it doesn't name; nothing changes until **Save owners**, which also creates teams for new names. A new draft's owner is the team that owns all of its transaction types. A run keeps the routing it started with, and the export's owner column is the transaction type's team, else the rule's owner team.

## Runs and findings

Admins and analysts start a run on **Runs → Run checks**. A run checks every transaction of the newest ready dataset against every live rule version, and keeps a snapshot of those versions, so its page and export never change afterwards. The run page shows the totals, each rule's counts, the findings with their evidence and an explanation in English and Arabic, the transactions that couldn't be checked and why, and the texts left for AI to judge. A rule whose columns the dataset no longer has is reported, and the other rules still run. One run at a time.

Upload the brief's `finding_format.csv` on **Set up → Upload the finding format**, and confirm which field goes in each column (proposed from the column names). Findings download in that format: its columns and order, severity and finding IDs written like its worked examples, and cells protected against spreadsheet formulas. Each run also says whether the format's worked examples were found.

`pnpm --filter @hrcc/eval test` includes a check that findings exported through the generated pack's format score 100% against its answer key.

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

## Deploy to Azure

The app runs on Azure Container Apps, in one environment. Every merge to `main` builds the images and rolls the apps out to them. To roll back, run the "Deploy" workflow with an earlier commit's tag, or revert the change on `main`.

[`infra/azure/README.md`](infra/azure/README.md) describes the setup, including the one-time steps.

## Checks

```bash
pnpm lint        # Biome (pnpm lint:fix to format)
pnpm typecheck
pnpm turbo run test --filter='!@hrcc/e2e'   # unit + integration (needs Docker for Testcontainers)
pnpm --filter @hrcc/api test:storage   # the Storage adapter against the local Supabase stack
pnpm build
pnpm --filter @hrcc/e2e test   # against the running Compose stack
```

Run the end-to-end tests against a throwaway database, with the AI provider keys left out of the Compose environment (`TYPESAFE_API_KEY= ANTHROPIC_FOUNDRY_API_KEY= ANTHROPIC_FOUNDRY_RESOURCE= docker compose -f infra/compose.yaml up -d`) so drafts come from the rules' words and every run is the same.

`RUN_LIVE_AI_TESTS=1 pnpm --filter @hrcc/ai exec vitest run test/live.test.ts` drafts the synthetic policy with the real providers (keys from `apps/ai/.env`; synthetic data only). Without the variable these tests are skipped.

## Notes

- Every action writes an audit event in the same database transaction. `audit_events` is append-only (database triggers) and hash-chained. Admins and auditors can verify it from the audit log screen.
- Mutating API calls need the header `x-hrcc-request: 1`. The typed client in `@hrcc/shared` adds it.
- Sign-in uses email and password (`AUTH_MODE=password`). `AUTH_MODE=oidc` turns password sign-in off; organisation sign-in comes later.
