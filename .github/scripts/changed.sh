#!/usr/bin/env bash
# Decides whether a check has work to do and writes run=true|false to $GITHUB_OUTPUT.
# A required check must always report, so a workflow cannot be skipped by a
# paths filter (the pull request would wait forever); it starts and does nothing.
#   frontend: frontend/ or .github/ changed
#   backend:  anything outside frontend/ changed (backend, infra, workflows, root)
# Anything but a pull request (nightly, manual) always runs.
#
# usage: changed.sh frontend|backend
# env:   GITHUB_EVENT_NAME, BASE_SHA, HEAD_SHA (pull request base and head)
set -euo pipefail

area="${1:?usage: changed.sh frontend|backend}"
out="${GITHUB_OUTPUT:-/dev/stdout}"

if [[ "${GITHUB_EVENT_NAME:-}" != "pull_request" ]]; then
  echo "run=true" >> "$out"
  exit 0
fi

files="$(git diff --name-only "${BASE_SHA:?}...${HEAD_SHA:?}")"
case "$area" in
  frontend) grep -qE '^(frontend/|\.github/)' <<< "$files" && run=true || run=false ;;
  backend)  grep -qv '^frontend/' <<< "$files" && run=true || run=false ;;
  *) echo "::error::unknown area '$area'"; exit 1 ;;
esac

if [[ "$run" == "false" ]]; then
  echo "::notice::no ${area} changes in this pull request, nothing to check"
fi
echo "run=${run}" >> "$out"
