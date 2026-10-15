#!/bin/sh
# Points apps/api/.env (created from .env.example when missing) at the local Supabase stack and
# gives Compose (infra/.env) its secret key. Run it after `supabase start`.
set -eu
cd "$(dirname "$0")/.."

status=$(supabase status -o env \
  --override-name db.url=DATABASE_URL \
  --override-name api.url=SUPABASE_URL \
  --override-name auth.secret_key=SUPABASE_SECRET_KEY 2>/dev/null) || status=""
value() { printf '%s\n' "$status" | sed -n "s/^$1=\"\(.*\)\"\$/\1/p"; }

key=$(value SUPABASE_SECRET_KEY)
if [ -z "$key" ]; then
  echo "No local Supabase stack is running. Start it with: supabase start" >&2
  exit 1
fi

# set_var FILE NAME VALUE replaces NAME's line in FILE, or adds it.
set_var() {
  touch "$1"
  grep -v "^$2=" "$1" >"$1.tmp" || true
  printf '%s=%s\n' "$2" "$3" >>"$1.tmp"
  mv "$1.tmp" "$1"
}

[ -f apps/api/.env ] || cp apps/api/.env.example apps/api/.env
set_var apps/api/.env DATABASE_URL "$(value DATABASE_URL)"
set_var apps/api/.env SUPABASE_URL "$(value SUPABASE_URL)"
set_var apps/api/.env SUPABASE_SECRET_KEY "$key"
set_var infra/.env SUPABASE_SECRET_KEY "$key"
echo "apps/api/.env and infra/.env now point at the local Supabase stack."
