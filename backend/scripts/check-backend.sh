#!/usr/bin/env bash
set -euo pipefail

backend_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$backend_dir"
export GOCACHE="${GOCACHE:-$backend_dir/.cache/go-build}"
export GOTMPDIR="${GOTMPDIR:-$backend_dir/.cache/tmp}"
export TMPDIR="$GOTMPDIR"
export GOFLAGS=-mod=readonly
export GOLANGCI_LINT_CACHE="${GOLANGCI_LINT_CACHE:-$backend_dir/.cache/golangci-lint}"
mkdir -p "$GOCACHE" "$GOTMPDIR"
if [[ -z "${TEST_DATABASE_URL:-${IDENTITY_TEST_DATABASE_URL:-}}" ]]; then
  printf 'Set TEST_DATABASE_URL to a disposable PostgreSQL database; integration tests must not be skipped.\n' >&2
  exit 1
fi
export TEST_DATABASE_URL="${TEST_DATABASE_URL:-$IDENTITY_TEST_DATABASE_URL}"
export IDENTITY_TEST_DATABASE_URL="$TEST_DATABASE_URL"
unformatted="$(gofmt -l cmd internal)"
if [[ -n "$unformatted" ]]; then
  printf 'Run gofmt on:\n%s\n' "$unformatted" >&2
  exit 1
fi
go mod tidy -diff
go build ./...
go vet ./...
go test -race -shuffle=on -count=1 ./...
go run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.14.0 run ./...
bash -n scripts/monitoring.sh scripts/check-backend.sh scripts/create-observability-pr.sh
python3 scripts/test-monitoring.py
