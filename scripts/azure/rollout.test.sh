#!/usr/bin/env bash
# Checks rollout.sh against a stand-in `az` that records every call.
# Run: bash scripts/azure/rollout.test.sh
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
failures=0

# The stand-in az: appends its arguments to $CALLS and answers as the scenario asks.
mkdir -p "$work/bin"
cat >"$work/bin/az" <<'STUB'
#!/usr/bin/env bash
echo "$*" >>"$CALLS"
name_of() { sed -E 's/.*--name ([^ ]+).*/\1/' <<<"$*"; }
case "$*" in
  "containerapp show "*)
    [ "${STUB_PROVISIONED:-yes}" = yes ] || exit 3
    name_of "$*"
    ;;
  "containerapp job update "*) ;;
  "containerapp job start "*) echo exec-1 ;;
  "containerapp job execution show "*)
    polls=$(cat "$STATE/polls" 2>/dev/null || echo 0)
    echo $((polls + 1)) >"$STATE/polls"
    if [ "$polls" -eq 0 ]; then echo Running; else echo "${STUB_JOB_RESULT:-Succeeded}"; fi
    ;;
  "containerapp update "*) echo "$(name_of "$*")--rev1" ;;
  "containerapp revision show "*)
    if [ "$(name_of "$*")" = "${STUB_UNHEALTHY_APP:-}" ]; then
      printf 'Failed\tUnhealthy\n'
    else
      printf 'Running\tHealthy\n'
    fi
    ;;
  "containerapp logs show "* | "containerapp job logs show "*) echo "(recent logs)" ;;
  *)
    echo "unexpected az call: $*" >&2
    exit 9
    ;;
esac
STUB
chmod +x "$work/bin/az"

# scenario NAME EXPECTED_EXIT COMMAND...: runs the command with the stand-in az.
scenario() {
  local name=$1 expected=$2 status
  shift 2
  export CALLS="$work/$name.calls" STATE="$work/$name.state"
  mkdir -p "$STATE"
  : >"$CALLS"
  set +e
  PATH="$work/bin:$PATH" AZURE_RESOURCE_GROUP=rg AZURE_REGISTRY=reg.azurecr.io \
    ROLLOUT_POLL_SECONDS=0 "$@" >"$work/$name.out" 2>&1
  status=$?
  set -e
  if [ "$status" -ne "$expected" ]; then
    echo "FAIL $name: exit $status, expected $expected"
    sed 's/^/  | /' "$work/$name.out"
    failures=$((failures + 1))
  else
    echo "ok   $name"
  fi
}

# expect_calls NAME EXPECTED: the exact az calls, one per line.
expect_calls() {
  if [ -z "$2" ]; then
    if [ -s "$work/$1.calls" ]; then
      echo "FAIL $1: expected no az calls"
      sed 's/^/  | /' "$work/$1.calls"
      failures=$((failures + 1))
    fi
    return 0
  fi
  if ! diff -u <(printf '%s\n' "$2") "$work/$1.calls" >"$work/$1.diff"; then
    echo "FAIL $1: az calls differ"
    sed 's/^/  | /' "$work/$1.diff"
    failures=$((failures + 1))
  fi
}

# expect_output NAME TEXT: the output mentions TEXT.
expect_output() {
  if ! grep -qF -- "$2" "$work/$1.out"; then
    echo "FAIL $1: output lacks \"$2\""
    sed 's/^/  | /' "$work/$1.out"
    failures=$((failures + 1))
  fi
}

revision_query='--query [properties.runningState, properties.healthState] --output tsv'

scenario rolls-out-in-order 0 bash "$here/rollout.sh" abc1234
expect_calls rolls-out-in-order "containerapp show --name emirates-api --resource-group rg --query name --output tsv
containerapp job update --name emirates-migrate --resource-group rg --image reg.azurecr.io/emirates-api:abc1234 --output none
containerapp job start --name emirates-migrate --resource-group rg --query name --output tsv
containerapp job execution show --name emirates-migrate --resource-group rg --job-execution-name exec-1 --query properties.status --output tsv
containerapp job execution show --name emirates-migrate --resource-group rg --job-execution-name exec-1 --query properties.status --output tsv
containerapp update --name emirates-ai --resource-group rg --image reg.azurecr.io/emirates-ai:abc1234 --query properties.latestRevisionName --output tsv
containerapp revision show --name emirates-ai --resource-group rg --revision emirates-ai--rev1 $revision_query
containerapp update --name emirates-api --resource-group rg --image reg.azurecr.io/emirates-api:abc1234 --query properties.latestRevisionName --output tsv
containerapp revision show --name emirates-api --resource-group rg --revision emirates-api--rev1 $revision_query
containerapp update --name emirates-web --resource-group rg --image reg.azurecr.io/emirates-web:abc1234 --query properties.latestRevisionName --output tsv
containerapp revision show --name emirates-web --resource-group rg --revision emirates-web--rev1 $revision_query"
expect_output rolls-out-in-order "Now running abc1234"

STUB_PROVISIONED=no scenario skips-unprovisioned 0 bash "$here/rollout.sh" abc1234
expect_calls skips-unprovisioned "containerapp show --name emirates-api --resource-group rg --query name --output tsv"
expect_output skips-unprovisioned "The apps are not provisioned yet"

STUB_UNHEALTHY_APP=emirates-api scenario stops-at-unhealthy-revision 1 bash "$here/rollout.sh" abc1234
expect_output stops-at-unhealthy-revision "emirates-api--rev1 is Failed/Unhealthy"
expect_output stops-at-unhealthy-revision "(recent logs)"
if grep -q "containerapp update --name emirates-web" "$work/stops-at-unhealthy-revision.calls"; then
  echo "FAIL stops-at-unhealthy-revision: web was updated after api failed"
  failures=$((failures + 1))
fi

STUB_JOB_RESULT=Failed scenario stops-when-migrations-fail 1 bash "$here/rollout.sh" abc1234
expect_output stops-when-migrations-fail "Migration job exec-1 ended: Failed"
if grep -q "^containerapp update " "$work/stops-when-migrations-fail.calls"; then
  echo "FAIL stops-when-migrations-fail: an app was updated after migrations failed"
  failures=$((failures + 1))
fi

scenario refuses-latest 2 bash "$here/rollout.sh" latest
expect_calls refuses-latest ""
scenario refuses-malformed-tag 2 bash "$here/rollout.sh" "abc 123"
scenario refuses-a-missing-tag 2 bash "$here/rollout.sh"
expect_calls refuses-a-missing-tag ""

if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo "all rollout checks passed"
