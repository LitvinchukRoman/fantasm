#!/bin/bash
# deploy-frontend <dev|prod> <env-sha-tag>: run one SSR container per environment.
# Host networking is intentional: API_INTERNAL_URL stays on loopback and neither
# the Node nor Go ports are reachable outside the instance.
set -euo pipefail
# shellcheck disable=SC1091
. /usr/local/lib/fantasm/common.sh

env_name="${1:-}"; tag="${2:-}"
case "$env_name" in
  dev)
    port="$FRONTEND_PORT_DEV"
    api_url="$API_INTERNAL_URL_DEV"
    ;;
  prod)
    port="$FRONTEND_PORT_PROD"
    api_url="$API_INTERNAL_URL_PROD"
    ;;
  *) echo "usage: deploy-frontend <dev|prod> <env-sha-tag>" >&2; exit 2 ;;
esac
[[ "$tag" =~ ^${env_name}-sha-[0-9a-f]{40}$ ]] || { echo "invalid immutable tag for $env_name: $tag" >&2; exit 2; }

exec 9>"/var/lock/fantasm-deploy-frontend-$env_name.lock"
flock -n 9 || { echo "another $env_name frontend deploy is running" >&2; exit 1; }

image="$FRONTEND_ECR_REPO:$tag"
state="/opt/fantasm/frontend-$env_name.image"
previous=$(cat "$state" 2>/dev/null || true)
docker pull -q "$image" >/dev/null

run_container() {
  docker rm -f "frontend-$env_name" >/dev/null 2>&1 || true
  docker run -d --name "frontend-$env_name" --restart unless-stopped \
    --network host \
    -e NODE_ENV=production -e HOST=127.0.0.1 -e "PORT=$port" -e "API_INTERNAL_URL=$api_url" \
    --memory "$FRONTEND_MEMORY" --memory-swap "$FRONTEND_MEMORY_SWAP" --cpus 1.0 --pids-limit 256 \
    --read-only --tmpfs /tmp:rw,noexec,nosuid,size=32m \
    --cap-drop ALL --security-opt no-new-privileges \
    --log-driver awslogs \
    --log-opt "awslogs-region=$REGION" \
    --log-opt "awslogs-group=/$PROJECT/$env_name/frontend" \
    "$1" >/dev/null
}

healthy() {
  for _ in $(seq 1 30); do
    curl -fsS -m 2 "http://127.0.0.1:$port/healthz" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

echo "deploying $image to $env_name (previous: ${previous:-none})"
run_container "$image"
if healthy; then
  echo "$image" > "$state"
  docker image prune -af --filter "until=72h" >/dev/null 2>&1 || true
  echo "deployed $image"
  exit 0
fi

echo "!!! $image did not become healthy; last logs:" >&2
docker logs --tail 40 "frontend-$env_name" >&2 || true
if [ -n "$previous" ] && [ "$previous" != "$image" ]; then
  echo "rolling back to $previous" >&2
  docker pull -q "$previous" >/dev/null || true
  run_container "$previous"
  healthy && echo "rolled back to $previous" >&2 || echo "!!! rollback also unhealthy" >&2
fi
exit 1
