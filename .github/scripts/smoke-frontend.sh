#!/usr/bin/env bash
# Public smoke test. In SSR mode this reaches Node through CloudFront/Caddy.
# In S3 mode (prod before cutover), SSM's internal /healthz check is the
# deployment proof and this confirms the currently live site remains intact.
set -euo pipefail

base="${1:?usage: smoke-frontend.sh <base-url>}"

for path in / /api/auth/providers; do
  ok=0
  for attempt in $(seq 1 20); do
    code=$(curl -sS -o /tmp/fantasm-smoke -w '%{http_code}' --max-time 10 "${base%/}${path}" || echo 000)
    if [[ "$code" == "200" ]]; then
      echo "ok: ${base%/}${path} -> 200"
      ok=1
      break
    fi
    echo "attempt ${attempt}: ${base%/}${path} -> ${code}"
    sleep 6
  done
  if [[ "$ok" != 1 ]]; then
    echo "::error::${base%/}${path} did not return 200"
    exit 1
  fi
done
