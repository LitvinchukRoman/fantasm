#!/bin/bash
# refresh-env <dev|prod>: (re)generate /opt/fantasm/<env>.env from SSM.
# Called by deploy-api before every deploy, so a changed OAuth secret or pool
# size takes effect on the next deploy without touching the box.
set -euo pipefail
# shellcheck disable=SC1091
. /usr/local/lib/fantasm/common.sh

env_name="${1:-}"
case "$env_name" in
  dev)  pool="$POOL_DEV" ;;
  prod) pool="$POOL_PROD" ;;
  *) echo "usage: refresh-env <dev|prod>" >&2; exit 2 ;;
esac

prefix="/$PROJECT/$env_name/"
params=$(aws ssm get-parameters-by-path --path "$prefix" --recursive --with-decryption --output json \
  | jq -c --arg p "$prefix" '[.Parameters[] | {key: (.Name | ltrimstr($p)), value: .Value}] | from_entries')

val() { jq -r --arg k "$1" '.[$k] // empty' <<<"$params"; }
# "unset" is the SSM placeholder for "not configured": expose it as empty.
opt() { local v; v=$(val "$1"); [ "$v" = "unset" ] && v=""; printf '%s' "$v"; }
req() { local v; v=$(val "$1"); [ -n "$v" ] || { echo "SSM parameter $prefix$1 is missing" >&2; exit 1; }; printf '%s' "$v"; }

db_host=$(req db/host); db_port=$(req db/port); db_name=$(req db/name)
db_user=$(req db/username); db_pass=$(req db/password)
public_url=$(req app/public-url)
app_secret=$(req app/app-secret)

umask 077
tmp=$(mktemp /opt/fantasm/.env.XXXXXX)
# The pool size is the API's DB_MAX_CONNS, not a pool_max_conns URL parameter
# (migrate's pgx driver would pass an unknown URL parameter on to the server).
cat > "$tmp" <<ENVFILE
ADDR=:8080
DATABASE_URL=postgres://${db_user}:${db_pass}@${db_host}:${db_port}/${db_name}?sslmode=verify-full&sslrootcert=/etc/ssl/rds-ca.pem
DB_MAX_CONNS=${pool}
MIGRATIONS_DIR=/app/migrations
MIGRATE_ON_START=true
PUBLIC_URL=${public_url}
ORGANIZATION_RULES_FILE=/app/config/organizations.json
TRUSTED_PROXY_CIDRS=${TRUSTED_PROXIES}
APP_SECRET=${app_secret}
GOOGLE_CLIENT_ID=$(opt app/google-client-id)
GOOGLE_CLIENT_SECRET=$(opt app/google-client-secret)
ENTRA_CLIENT_ID=$(opt app/entra-client-id)
ENTRA_CLIENT_SECRET=$(opt app/entra-client-secret)
ENVFILE
chmod 600 "$tmp"
mv "$tmp" "/opt/fantasm/$env_name.env"
echo "refreshed /opt/fantasm/$env_name.env"
