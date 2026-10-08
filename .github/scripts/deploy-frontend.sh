#!/usr/bin/env bash
# Send an immutable frontend tag through the environment-scoped SSM document,
# wait for host health/rollback, and print the complete command result.
set -euo pipefail

tag="${1:?usage: deploy-frontend.sh <env-sha-tag>}"
: "${EC2_INSTANCE_ID:?environment variable EC2_INSTANCE_ID is empty}"
: "${FRONTEND_SSM_DEPLOY_DOCUMENT:?environment variable FRONTEND_SSM_DEPLOY_DOCUMENT is empty}"
region="${AWS_REGION:-eu-central-1}"

command_id=$(aws ssm send-command \
  --region "$region" \
  --document-name "$FRONTEND_SSM_DEPLOY_DOCUMENT" \
  --instance-ids "$EC2_INSTANCE_ID" \
  --parameters "tag=${tag}" \
  --comment "deploy frontend ${tag} (run ${GITHUB_RUN_ID:-local})" \
  --timeout-seconds 600 \
  --query 'Command.CommandId' --output text)
echo "ssm command: ${command_id}"

status=Pending
for _ in $(seq 1 150); do
  sleep 5
  status=$(aws ssm get-command-invocation --region "$region" \
    --command-id "$command_id" --instance-id "$EC2_INSTANCE_ID" \
    --query 'Status' --output text 2>/dev/null || echo Pending)
  case "$status" in
    Success | Failed | Cancelled | TimedOut) break ;;
  esac
done

invocation=$(aws ssm get-command-invocation --region "$region" \
  --command-id "$command_id" --instance-id "$EC2_INSTANCE_ID" --output json)
echo "--- stdout"
jq -r '.StandardOutputContent' <<<"$invocation"
echo "--- stderr"
jq -r '.StandardErrorContent' <<<"$invocation"

if [[ "$status" != "Success" ]]; then
  echo "::error::frontend deploy of ${tag} finished with status ${status}"
  exit 1
fi
