#!/usr/bin/env bash
# Publish frontend/build/client. Cache-Control matches frontend/server.js:
# hashed /assets for a year, HTML and unhashed *.data revalidate, other files one hour.
set -euo pipefail

if [[ -z "${AWS_FRONTEND_BUCKET:-}" ]]; then
  echo "::error::repository variable AWS_FRONTEND_BUCKET is empty (set it from terraform output bucket_name)"
  exit 1
fi
if [[ -z "${AWS_CLOUDFRONT_DISTRIBUTION_ID:-}" ]]; then
  echo "::error::repository variable AWS_CLOUDFRONT_DISTRIBUTION_ID is empty (set it from terraform output distribution_id)"
  exit 1
fi

dist="${DIST:-build/client}"
if [[ ! -f "${dist}/index.html" ]]; then
  echo "::error::${dist}/index.html is missing; the static client was not built"
  exit 1
fi

bucket="s3://${AWS_FRONTEND_BUCKET}"

aws s3 sync "${dist}" "${bucket}" \
  --delete \
  --exclude ".vite/*" \
  --cache-control "public, max-age=3600"

aws s3 cp "${dist}/assets" "${bucket}/assets" \
  --recursive \
  --cache-control "public, max-age=31536000, immutable"

aws s3 cp "${dist}" "${bucket}" \
  --recursive \
  --exclude "*" \
  --include "*.html" \
  --include "*.data" \
  --include "*.xml" \
  --include "*.txt" \
  --cache-control "public, max-age=0, must-revalidate"

aws cloudfront create-invalidation \
  --distribution-id "${AWS_CLOUDFRONT_DISTRIBUTION_ID}" \
  --paths "/*" \
  --query 'Invalidation.Id' \
  --output text
