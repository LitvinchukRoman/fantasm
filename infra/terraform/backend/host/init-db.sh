#!/bin/bash
# init-db <dev|prod>: idempotently create the environment's role and database
# on the shared RDS instance. The role owns only its own database, and CONNECT
# is revoked from PUBLIC, so the dev role cannot open the prod database.
set -euo pipefail
# shellcheck disable=SC1091
. /usr/local/lib/fantasm/common.sh

env_name="${1:-}"
case "$env_name" in dev | prod) ;; *) echo "usage: init-db <dev|prod>" >&2; exit 2 ;; esac

prefix="/$PROJECT/$env_name/db"
host=$(ssm_get "$prefix/host"); port=$(ssm_get "$prefix/port")
db=$(ssm_get "$prefix/name"); role=$(ssm_get "$prefix/username"); role_pw=$(ssm_get "$prefix/password")
admin=$(ssm_get "/$PROJECT/shared/db/master-username")

export PGPASSWORD PGSSLMODE=verify-full PGSSLROOTCERT=/opt/fantasm/rds-ca.pem
PGPASSWORD=$(ssm_get "/$PROJECT/shared/db/master-password")

psql -h "$host" -p "$port" -U "$admin" -d postgres -X -q -v ON_ERROR_STOP=1 \
  -v role="$role" -v pw="$role_pw" -v db="$db" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'pw')
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'role', :'pw') \gexec
-- the admin must be able to SET ROLE to the owner to create a database owned by it
SELECT format('GRANT %I TO CURRENT_USER', :'role') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'role')
 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'db', :'role') \gexec
SQL
echo "database $db ready (owner $role)"
