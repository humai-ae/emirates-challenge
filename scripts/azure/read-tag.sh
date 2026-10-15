#!/usr/bin/env bash
# Prints the image tag in a deploy file such as deploy/prod.yaml, which holds exactly one line:
#   image_tag: "<tag>"
# An empty tag ("") means the environment isn't initialised yet: nothing is printed.
#
# Usage: scripts/azure/read-tag.sh <file>
set -euo pipefail

file=${1:?Usage: read-tag.sh <file>}
lines=$(grep -vE '^[[:space:]]*(#|$)' "$file" || true)
pattern='^image_tag: "([A-Za-z0-9_.-]*)"$'
if [ "$(printf '%s\n' "$lines" | grep -c .)" -ne 1 ] || ! [[ $lines =~ $pattern ]]; then
  echo "$file must hold exactly one line: image_tag: \"<tag>\"" >&2
  exit 2
fi
tag=${BASH_REMATCH[1]}
if [ "$tag" = latest ]; then
  echo "$file: use an immutable tag such as a commit SHA, not latest" >&2
  exit 2
fi
printf '%s\n' "$tag"
