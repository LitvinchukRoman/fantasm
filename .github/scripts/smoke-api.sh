#!/usr/bin/env bash
# Poll a public URL until it answers 200 (through CloudFront, Caddy and Go).
# usage: smoke-api.sh <base-url>   e.g. https://fantasm-dev.naukma.com
set -euo pipefail

base="${1:?usage: smoke-api.sh <base-url>}"
url="${base%/}/api/auth/providers"

for attempt in $(seq 1 20); do
  code=$(curl -sS -o /tmp/smoke.json -w '%{http_code}' --max-time 10 "$url" || echo 000)
  if [[ "$code" == "200" ]]; then
    echo "ok: ${url} -> 200"
    cat /tmp/smoke.json
    echo
    exit 0
  fi
  echo "attempt ${attempt}: ${url} -> ${code}"
  sleep 6
done
echo "::error::${url} did not return 200"
exit 1
