#!/bin/sh
# Points apps/api/.env at the local Supabase stack and gives Compose (infra/.env) its secret key;
# each file is created from the .env.example beside it when missing. Run it after `supabase start`.
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

# set_var FILE NAME VALUE replaces NAME's line in FILE where it stands, or adds it at the end.
set_var() {
  touch "$1"
  NAME=$2 VALUE=$3 awk '
    index($0, ENVIRON["NAME"] "=") == 1 { if (!done) print ENVIRON["NAME"] "=" ENVIRON["VALUE"]; done = 1; next }
    { print }
    END { if (!done) print ENVIRON["NAME"] "=" ENVIRON["VALUE"] }
  ' "$1" >"$1.tmp"
  mv "$1.tmp" "$1"
}

[ -f apps/api/.env ] || cp apps/api/.env.example apps/api/.env
set_var apps/api/.env DATABASE_URL "$(value DATABASE_URL)"
set_var apps/api/.env SUPABASE_URL "$(value SUPABASE_URL)"
set_var apps/api/.env SUPABASE_SECRET_KEY "$key"
[ -f infra/.env ] || cp infra/.env.example infra/.env
set_var infra/.env SUPABASE_SECRET_KEY "$key"
echo "apps/api/.env and infra/.env now point at the local Supabase stack."
