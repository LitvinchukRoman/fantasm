#!/usr/bin/env bash
# Deploy fantasm-api:<tag> to one environment through its SSM deploy document and
# wait for the result. The box runs scripts/deploy-api.sh, which waits for
# /healthz and rolls back to the previous image when the new one is unhealthy,
# so a non-zero exit here means "not deployed" (and rolled back if it could).
#
# usage: deploy-backend.sh <tag>
# env:   EC2_INSTANCE_ID, SSM_DEPLOY_DOCUMENT (from the GitHub environment), AWS_REGION
set -euo pipefail

tag="${1:?usage: deploy-backend.sh <tag>}"
: "${EC2_INSTANCE_ID:?repository variable EC2_INSTANCE_ID is empty (terraform output github_environment_commands, backend stack)}"
: "${SSM_DEPLOY_DOCUMENT:?repository variable SSM_DEPLOY_DOCUMENT is empty}"
region="${AWS_REGION:-eu-central-1}"

command_id=$(aws ssm send-command \
  --region "$region" \
  --document-name "$SSM_DEPLOY_DOCUMENT" \
  --instance-ids "$EC2_INSTANCE_ID" \
  --parameters "tag=${tag}" \
  --comment "deploy ${tag} (run ${GITHUB_RUN_ID:-local})" \
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
  echo "::error::deploy of ${tag} finished with status ${status}"
  exit 1
fi
