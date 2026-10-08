#!/usr/bin/env bash
# Stage only hashed assets for SSR. Deliberately never sync or delete HTML:
# prod remains on its existing S3 site until frontend_delivery_mode is changed
# by a separate reviewed Terraform apply.
set -euo pipefail

if [[ -z "${AWS_FRONTEND_BUCKET:-}" ]]; then
  echo "::error::repository variable AWS_FRONTEND_BUCKET is empty (set it from terraform output bucket_name)"
  exit 1
fi
dist="${DIST:-build/client}"
if [[ ! -d "${dist}/assets" ]] || [[ -z "$(find "${dist}/assets" -type f -print -quit)" ]]; then
  echo "::error::${dist}/assets is missing or empty"
  exit 1
fi

bucket="s3://${AWS_FRONTEND_BUCKET}"

aws s3 sync "${dist}/assets" "${bucket}/assets" \
  --cache-control "public, max-age=31536000, immutable"
