#!/usr/bin/env bash
set -euo pipefail

backend_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$backend_dir"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-backend}"
if [[ ! "$COMPOSE_PROJECT_NAME" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
  printf 'COMPOSE_PROJECT_NAME must contain only lowercase letters, digits, underscores, and hyphens.\n' >&2
  exit 2
fi
credential_dir="$backend_dir/.cache/monitoring/$COMPOSE_PROJECT_NAME"
credential_file="$credential_dir/grafana-admin-password"
if [[ -z "${GRAFANA_ADMIN_PASSWORD:-}" ]]; then
  if [[ ! -f "$credential_file" ]]; then
    mkdir -p "$credential_dir"
    (umask 077; openssl rand -hex 24 > "$credential_file")
  fi
  export GRAFANA_ADMIN_PASSWORD
  GRAFANA_ADMIN_PASSWORD="$(cat "$credential_file")"
fi
compose=(docker compose -f compose.yaml -f compose.monitoring.yaml)

wait_url() {
  local url="$1"
  for ((attempt=0; attempt<90; attempt++)); do
    if curl --fail --silent --max-time 2 "$url" > /dev/null; then
      return 0
    fi
    sleep 1
  done
  printf 'Timed out waiting for %s\n' "$url" >&2
  return 1
}

case "${1:-help}" in
  up)
    build=(--build)
    case "${2:-}" in
      --no-build) build=(--no-build) ;;
      "") ;;
      *) printf 'Usage: %s up [--no-build]\n' "$0" >&2; exit 2 ;;
    esac
    "${compose[@]}" up -d prometheus loki alloy grafana
    wait_url "http://127.0.0.1:${PROMETHEUS_PORT:-9090}/-/ready"
    wait_url "http://127.0.0.1:${LOKI_PORT:-3100}/ready"
    wait_url "http://127.0.0.1:${ALLOY_PORT:-12345}/-/ready"
    wait_url "http://127.0.0.1:${GRAFANA_PORT:-3000}/api/health"
    "${compose[@]}" up -d --wait --wait-timeout 180 "${build[@]}" fantasm-api
    printf 'Dashboard: http://127.0.0.1:%s/d/fantasm-overview\nUser: admin\n' "${GRAFANA_PORT:-3000}"
    if [[ -f "$credential_file" ]]; then
      printf 'Password file: %s\n' "$credential_file"
    else
      printf 'Password: supplied through GRAFANA_ADMIN_PASSWORD\n'
    fi
    ;;
  off)
    docker compose -f compose.yaml up -d --wait --wait-timeout 180 --no-deps --force-recreate fantasm-api
    "${compose[@]}" stop prometheus loki alloy grafana
    ;;
  down)
    "${compose[@]}" down
    ;;
  status)
    "${compose[@]}" ps
    ;;
  validate)
    "${compose[@]}" config --quiet
    "${compose[@]}" run --rm --no-deps --entrypoint promtool prometheus check config /etc/prometheus/prometheus.yml
    "${compose[@]}" run --rm --no-deps --entrypoint promtool prometheus test rules /etc/prometheus/alerts.test.yml
    "${compose[@]}" run --rm --no-deps loki -config.file=/etc/loki/config.yaml -verify-config=true
    "${compose[@]}" run --rm --no-deps alloy validate /etc/alloy/config.alloy
    ;;
  *)
    printf 'Usage: %s {up [--no-build]|off|down|status|validate}\n' "$0"
    [[ "${1:-help}" == help ]]
    ;;
esac
