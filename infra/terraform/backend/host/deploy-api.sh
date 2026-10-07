#!/bin/bash
# deploy-api <dev|prod> <tag>: run image fantasm-api:<tag> as container api-<env>.
# Refreshes env and the database first, waits for /healthz, and rolls back to the
# previous image when the new one does not become healthy. Exit code 1 = failed
# (and rolled back if a previous image existed).
set -euo pipefail
# shellcheck disable=SC1091
. /usr/local/lib/fantasm/common.sh

env_name="${1:-}"; tag="${2:-}"
case "$env_name" in
  dev)  port="$PORT_DEV"  ;;
  prod) port="$PORT_PROD" ;;
  *) echo "usage: deploy-api <dev|prod> <tag>" >&2; exit 2 ;;
esac
[[ "$tag" =~ ^(sha|release)-[0-9a-f]{7,40}$ ]] || { echo "invalid tag: $tag" >&2; exit 2; }

exec 9>"/var/lock/fantasm-deploy-$env_name.lock"
flock -n 9 || { echo "another $env_name deploy is running" >&2; exit 1; }

image="$ECR_REPO:$tag"
state="/opt/fantasm/$env_name.image"
previous=$(cat "$state" 2>/dev/null || true)

/usr/local/bin/refresh-env "$env_name"
/usr/local/bin/init-db "$env_name"
docker pull -q "$image" >/dev/null

run_container() {
  docker rm -f "api-$env_name" >/dev/null 2>&1 || true
  docker run -d --name "api-$env_name" --restart unless-stopped \
    --env-file "/opt/fantasm/$env_name.env" \
    -p "127.0.0.1:$port:8080" \
    --memory "$API_MEMORY" --memory-swap "$API_MEMORY_SWAP" --cpus 1.0 --pids-limit 256 \
    --read-only --tmpfs /tmp:rw,noexec,size=16m \
    --cap-drop ALL --security-opt no-new-privileges \
    -v /opt/fantasm/rds-ca.pem:/etc/ssl/rds-ca.pem:ro \
    --log-driver awslogs \
    --log-opt "awslogs-region=$REGION" \
    --log-opt "awslogs-group=/$PROJECT/$env_name/api" \
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
docker logs --tail 40 "api-$env_name" >&2 || true
if [ -n "$previous" ] && [ "$previous" != "$image" ]; then
  echo "rolling back to $previous" >&2
  docker pull -q "$previous" >/dev/null || true
  run_container "$previous"
  healthy && echo "rolled back to $previous" >&2 || echo "!!! rollback also unhealthy" >&2
fi
exit 1
