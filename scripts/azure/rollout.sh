#!/usr/bin/env bash
# Rolls one environment out to an image tag. First the migration job runs with the new api image;
# then ai, api and web are updated in turn. `az containerapp update` returns before the new
# container has started, so each step waits until the job has succeeded or the revision is
# running and healthy, and prints recent logs when it isn't.
#
# Usage: scripts/azure/rollout.sh <dev|prod> <tag>
# Needs a signed-in `az` with access to the resource group, and in the environment:
#   AZURE_RESOURCE_GROUP   e.g. emirates-challenge
#   AZURE_REGISTRY         the registry's login server, e.g. emirateschallenge.azurecr.io
# Optional: ROLLOUT_WAIT_SECONDS (per step, default 900), ROLLOUT_POLL_SECONDS (default 10).
set -euo pipefail

environment=${1:-}
tag=${2:-}
group=${AZURE_RESOURCE_GROUP:?Set AZURE_RESOURCE_GROUP}
registry=${AZURE_REGISTRY:?Set AZURE_REGISTRY}
wait_seconds=${ROLLOUT_WAIT_SECONDS:-900}
poll_seconds=${ROLLOUT_POLL_SECONDS:-10}

case "$environment" in
  dev | prod) ;;
  *)
    echo "Usage: rollout.sh <dev|prod> <tag>" >&2
    exit 2
    ;;
esac
tag_pattern='^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$'
if ! [[ $tag =~ $tag_pattern ]] || [ "$tag" = latest ]; then
  echo "Refusing image tag '$tag': use an immutable tag such as a commit SHA." >&2
  exit 2
fi

image() { echo "$registry/hrcc/$1:$tag"; }

# apps.bicep creates an environment's apps; until then there is nothing to roll out.
if ! az containerapp show --name "hrcc-api-$environment" --resource-group "$group" \
  --query name --output tsv >/dev/null 2>&1; then
  echo "::warning::$environment is not provisioned yet (no hrcc-api-$environment in $group); nothing rolled out."
  exit 0
fi

job="hrcc-migrate-$environment"
echo "Migrating $environment with $(image api)"
az containerapp job update --name "$job" --resource-group "$group" --image "$(image api)" --output none
execution=$(az containerapp job start --name "$job" --resource-group "$group" --query name --output tsv)
deadline=$((SECONDS + wait_seconds))
while :; do
  status=$(az containerapp job execution show --name "$job" --resource-group "$group" \
    --job-execution-name "$execution" --query properties.status --output tsv)
  case "$status" in
    Succeeded)
      echo "Migrations finished ($execution)"
      break
      ;;
    Failed | Stopped | Degraded)
      echo "::error::Migration job $execution ended: $status"
      az containerapp job logs show --name "$job" --resource-group "$group" \
        --execution "$execution" --container migrate --tail 80 || true
      exit 1
      ;;
  esac
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "::error::Migration job $execution did not finish within ${wait_seconds}s (last status: $status)"
    exit 1
  fi
  sleep "$poll_seconds"
done

# The api calls ai, and web proxies to the api, so they roll out in that order.
for component in ai api web; do
  app="hrcc-$component-$environment"
  echo "Updating $app to $(image "$component")"
  revision=$(az containerapp update --name "$app" --resource-group "$group" \
    --image "$(image "$component")" --query properties.latestRevisionName --output tsv)
  deadline=$((SECONDS + wait_seconds))
  while :; do
    # The two values may come on one line or two; either way they become "<running> <health>".
    state=$(az containerapp revision show --name "$app" --resource-group "$group" \
      --revision "$revision" --query "[properties.runningState, properties.healthState]" --output tsv |
      tr '\t\n' '  ')
    read -r running health <<<"$state"
    case "$running/$health" in
      Running/Healthy | RunningAtMaxScale/Healthy)
        echo "$app: $revision is running and healthy"
        break
        ;;
      Failed/* | */Unhealthy | Degraded/*)
        echo "::error::$app: $revision is $running/$health"
        az containerapp logs show --name "$app" --resource-group "$group" \
          --revision "$revision" --tail 80 || true
        exit 1
        ;;
    esac
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "::error::$app: $revision was not healthy within ${wait_seconds}s (last: $running/$health)"
      az containerapp logs show --name "$app" --resource-group "$group" \
        --revision "$revision" --tail 80 || true
      exit 1
    fi
    sleep "$poll_seconds"
  done
done

echo "$environment now runs $tag"
