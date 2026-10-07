#!/bin/bash
# Idempotent host configuration, run as root by the SSM document
# fantasm-configure-host (on association create/update, daily, or on demand):
#   aws ssm send-command --document-name fantasm-configure-host --targets Key=InstanceIds,Values=<id>
# Safe to re-run: every step checks before it acts, and Caddy is reloaded only
# when its config changed.
set -euo pipefail
# shellcheck disable=SC1091
. /usr/local/lib/fantasm/common.sh

log() { echo "[configure-host] $*"; }
install_if_changed() { # src dst mode owner -> returns 0 when dst changed
  local src=$1 dst=$2 mode=$3 owner=$4
  if [ -f "$dst" ] && cmp -s "$src" "$dst"; then return 1; fi
  install -m "$mode" -o "${owner%%:*}" -g "${owner##*:}" "$src" "$dst"
  return 0
}

# ── swap: 1 GiB box, headroom for Docker + two Go processes + Caddy ──
if ! swapon --show=NAME --noheadings | grep -q '^/swapfile$'; then
  log "enabling 1 GiB swap"
  [ -f /swapfile ] || { dd if=/dev/zero of=/swapfile bs=1M count=1024 status=none; chmod 600 /swapfile; mkswap /swapfile >/dev/null; }
  swapon /swapfile
fi
grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness=10' > /etc/sysctl.d/90-fantasm.conf
sysctl -q -w vm.swappiness=10

# ── packages ──
missing=()
for pkg in docker jq postgresql16 amazon-ecr-credential-helper; do
  rpm -q "$pkg" >/dev/null 2>&1 || missing+=("$pkg")
done
if [ "${#missing[@]}" -gt 0 ]; then
  log "installing: ${missing[*]}"
  dnf install -y -q "${missing[@]}"
fi
systemctl enable --now docker >/dev/null

# ECR login through the credential helper (runs as root via SSM and the deploy scripts).
mkdir -p /root/.docker
registry="${ECR_REPO%%/*}"
printf '{"credHelpers":{"%s":"ecr-login"}}\n' "$registry" > /root/.docker/config.json

# RDS CA bundle: the API connects with sslmode=verify-full.
mkdir -p /opt/fantasm
if [ ! -s /opt/fantasm/rds-ca.pem ]; then
  curl -fsSL --retry 5 --retry-delay 5 --retry-all-errors \
    -o /opt/fantasm/rds-ca.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
  chmod 644 /opt/fantasm/rds-ca.pem
fi

# ── Caddy with rate limiting and CloudFront ranges ──
caddy_changed=0
if ! id caddy >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/caddy --shell /sbin/nologin caddy
fi
if [ ! -x /usr/local/bin/caddy ] \
  || ! /usr/local/bin/caddy list-modules 2>/dev/null | grep -q 'rate_limit' \
  || ! /usr/local/bin/caddy list-modules 2>/dev/null | grep -q 'cloudfront'; then
  log "downloading Caddy (arm64) with caddy-ratelimit and caddy-trusted-cloudfront"
  curl -fsSL --retry 5 --retry-delay 10 --retry-all-errors -o /tmp/caddy.new \
    "https://caddyserver.com/api/download?os=linux&arch=arm64&p=github.com/mholt/caddy-ratelimit&p=github.com/xcaddyplugins/caddy-trusted-cloudfront"
  chmod +x /tmp/caddy.new
  /tmp/caddy.new version >/dev/null
  mv /tmp/caddy.new /usr/local/bin/caddy
  caddy_changed=1
fi

if install_if_changed /usr/local/lib/fantasm/caddy.service /etc/systemd/system/caddy.service 644 root:root; then
  systemctl daemon-reload
  caddy_changed=1
fi

mkdir -p /etc/caddy
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
secret_prod=$(ssm_get "/$PROJECT/prod/edge/origin-secret")
secret_dev=$(ssm_get "/$PROJECT/dev/edge/origin-secret")
if [ -z "$secret_prod" ] || [ -z "$secret_dev" ]; then
  echo "origin secrets missing in SSM (apply the edge stack first)" >&2
  exit 1
fi
acme_line=""
[ -z "${ACME_EMAIL:-}" ] || acme_line="	email $ACME_EMAIL"
sed \
  -e "s|__ACME_EMAIL__|$acme_line|" \
  -e "s|__ORIGIN_HOST_PROD__|$ORIGIN_HOST_PROD|g" \
  -e "s|__ORIGIN_HOST_DEV__|$ORIGIN_HOST_DEV|g" \
  -e "s|__PORT_PROD__|$PORT_PROD|g" \
  -e "s|__PORT_DEV__|$PORT_DEV|g" \
  -e "s|__SECRET_PROD__|$secret_prod|g" \
  -e "s|__SECRET_DEV__|$secret_dev|g" \
  -e "s|__RL_GLOBAL_PROD__|$RL_GLOBAL_PROD|g" \
  -e "s|__RL_GLOBAL_DEV__|$RL_GLOBAL_DEV|g" \
  -e "s|__RL_IP__|$RL_IP_PER_MIN|g" \
  -e "s|__RL_AUTH__|$RL_AUTH_PER_MIN|g" \
  /usr/local/lib/fantasm/Caddyfile.tpl > "$tmp"
# The rendered file holds the origin secrets: readable by root and caddy only.
chmod 640 "$tmp"
config_changed=0
install_if_changed "$tmp" /etc/caddy/Caddyfile 640 root:caddy && config_changed=1

if [ "$config_changed" = 1 ] || [ "$caddy_changed" = 1 ]; then
  /usr/local/bin/caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
fi

systemctl enable caddy >/dev/null 2>&1
if ! systemctl is-active --quiet caddy || [ "$caddy_changed" = 1 ]; then
  log "(re)starting Caddy"
  systemctl restart caddy
elif [ "$config_changed" = 1 ]; then
  log "reloading Caddy config"
  systemctl reload caddy
fi

# ── deploy tooling ──
install -m 755 /usr/local/lib/fantasm/deploy-api.sh /usr/local/bin/deploy-api
install -m 755 /usr/local/lib/fantasm/refresh-env.sh /usr/local/bin/refresh-env
install -m 755 /usr/local/lib/fantasm/init-db.sh /usr/local/bin/init-db

log "done"
