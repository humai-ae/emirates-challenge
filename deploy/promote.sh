#!/usr/bin/env bash
# Writes the tag prod should run into deploy/prod.yaml, for a promotion PR. Without an argument
# it takes the tag dev runs now (asks Azure; needs `az login` with read access); pass a tag (a
# commit SHA built on main) to choose another. Nothing is committed or deployed here: merging
# the PR is the deploy.
#
# Usage: deploy/promote.sh [tag]
set -euo pipefail
cd "$(dirname "$0")/.."

tag=${1:-}
if [ -z "$tag" ]; then
  image=$(az containerapp show --name hrcc-api-dev \
    --resource-group "${AZURE_RESOURCE_GROUP:-emirates-challenge}" \
    --query "properties.template.containers[0].image" --output tsv)
  tag=${image##*:}
fi
tag_pattern='^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$'
if ! [[ $tag =~ $tag_pattern ]] || [ "$tag" = latest ]; then
  echo "Refusing image tag '$tag': use an immutable tag such as a commit SHA." >&2
  exit 2
fi

current=$(scripts/azure/read-tag.sh deploy/prod.yaml)
if [ "$current" = "$tag" ]; then
  echo "prod already runs $tag."
  exit 0
fi
sed -i.bak -E "s/^image_tag: \".*\"$/image_tag: \"$tag\"/" deploy/prod.yaml && rm deploy/prod.yaml.bak
echo "deploy/prod.yaml: ${current:-(not initialised)} -> $tag"
echo "Commit it on a branch (e.g. promote/prod-$(date +%Y-%m-%d)) and open a PR; merging rolls prod out."
