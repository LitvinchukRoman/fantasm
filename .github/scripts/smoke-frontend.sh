#!/usr/bin/env bash
# Public smoke test through CloudFront: HTML must come from Node SSR (not from
# S3), the API must answer, and a hashed asset referenced by the page must load.
set -euo pipefail

base="${1:?usage: smoke-frontend.sh <base-url>}"
base="${base%/}"

for path in / /api/auth/providers; do
  ok=0
  for attempt in $(seq 1 20); do
    code=$(curl -sS -o /tmp/fantasm-smoke -w '%{http_code}' --max-time 10 "${base}${path}" || echo 000)
    if [[ "$code" == "200" ]]; then
      echo "ok: ${base}${path} -> 200"
      ok=1
      break
    fi
    echo "attempt ${attempt}: ${base}${path} -> ${code}"
    sleep 6
  done
  if [[ "$ok" != 1 ]]; then
    echo "::error::${base}${path} did not return 200"
    exit 1
  fi
done

server=$(curl -sS -o /tmp/fantasm-smoke.html -D - --max-time 10 "${base}/" | tr -d '\r' | awk -F': ' 'tolower($1) == "server" { print $2 }')
if [[ "$server" == "AmazonS3" ]]; then
  echo "::error::${base}/ is served by S3, not by Node SSR"
  exit 1
fi
echo "ok: ${base}/ is server-rendered"

asset=$(grep -oE '/assets/[A-Za-z0-9._-]+\.js' /tmp/fantasm-smoke.html | head -n 1 || true)
if [[ -z "$asset" ]]; then
  echo "::error::${base}/ references no /assets/*.js"
  exit 1
fi
code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "${base}${asset}" || echo 000)
if [[ "$code" != "200" ]]; then
  echo "::error::${base}${asset} -> ${code}"
  exit 1
fi
echo "ok: ${base}${asset} -> 200"

# Every form is a React Router action. Its CSRF check compares the browser Origin
# with the URL Node reconstructs behind Caddy, and the action then calls the API,
# which checks Origin again. Logging out without a session is a harmless no-op
# that crosses both checks.
action() {
  curl -sS -o /dev/null -w '%{http_code}' --max-time 10 -X POST \
    -H "Origin: $1" -H 'Content-Type: application/x-www-form-urlencoded' --data '' "${base}/logout.data" || echo 000
}
code=$(action "$base")
if [[ ! "$code" =~ ^[23] ]]; then
  echo "::error::same-origin form action -> ${code} (forms are broken)"
  exit 1
fi
echo "ok: same-origin form action -> ${code}"
code=$(action "https://smoke-foreign-origin.invalid")
if [[ "$code" != "400" ]]; then
  echo "::error::foreign-origin form action -> ${code}, expected 400 (CSRF check is off)"
  exit 1
fi
echo "ok: foreign-origin form action -> 400"
