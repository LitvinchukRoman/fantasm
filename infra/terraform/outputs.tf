output "site_url" {
  description = "Public URL of the static frontend."
  value       = local.site_url
}

output "bucket_name" {
  description = "S3 bucket CI syncs build/client into."
  value       = aws_s3_bucket.frontend.id
}

output "distribution_id" {
  description = "CloudFront distribution invalidated after each publish."
  value       = aws_cloudfront_distribution.frontend.id
}

output "deploy_role_arn" {
  description = "IAM role assumed by GitHub Actions via OIDC."
  value       = aws_iam_role.deploy.arn
}

output "github_variable_commands" {
  description = "Run these as LitvinchukRoman after apply, before the first deploy."
  value       = <<-EOT
    gh variable set VITE_SITE_URL --repo ${var.github_repository} --body "${local.site_url}"
    gh variable set AWS_DEPLOY_ROLE_ARN --repo ${var.github_repository} --body "${aws_iam_role.deploy.arn}"
    gh variable set AWS_FRONTEND_BUCKET --repo ${var.github_repository} --body "${aws_s3_bucket.frontend.id}"
    gh variable set AWS_CLOUDFRONT_DISTRIBUTION_ID --repo ${var.github_repository} --body "${aws_cloudfront_distribution.frontend.id}"
  EOT
}
