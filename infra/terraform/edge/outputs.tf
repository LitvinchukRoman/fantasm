output "site_urls" {
  description = "Public URL per environment."
  value       = { for env, c in local.envs : env => c.site_url }
}

output "frontend_delivery_mode" {
  description = "Current default HTML delivery mode per environment."
  value       = var.frontend_delivery_mode
}

output "bucket_names" {
  description = "S3 bucket per environment that CI syncs build/client into."
  value       = { for env, b in aws_s3_bucket.frontend : env => b.id }
}

output "distribution_ids" {
  description = "CloudFront distribution per environment, invalidated after each publish."
  value       = { for env, d in aws_cloudfront_distribution.frontend : env => d.id }
}

output "deploy_role_arns" {
  description = "IAM role per environment assumed by GitHub Actions via OIDC."
  value       = { for env, r in aws_iam_role.deploy_env : env => r.arn }
}

output "origin_secret_parameters" {
  description = "SSM parameter per environment holding the CloudFront -> origin shared secret."
  value       = { for env, p in aws_ssm_parameter.origin_secret : env => p.name }
}

output "github_environment_commands" {
  description = "Run as LitvinchukRoman after apply: create the GitHub environments and set their variables (environment-scoped, so a prod job can never read dev values)."
  value       = <<-EOT
    # environments (add a required reviewer to prod in the GitHub UI: Settings -> Environments -> prod)
    gh api -X PUT repos/${var.github_repository}/environments/dev
    gh api -X PUT repos/${var.github_repository}/environments/prod
%{for env, c in local.envs~}

    # ${env}
    gh variable set VITE_SITE_URL                 --repo ${var.github_repository} --env ${env} --body "${c.site_url}"
    gh variable set AWS_DEPLOY_ROLE_ARN           --repo ${var.github_repository} --env ${env} --body "${aws_iam_role.deploy_env[env].arn}"
    gh variable set AWS_FRONTEND_BUCKET           --repo ${var.github_repository} --env ${env} --body "${aws_s3_bucket.frontend[env].id}"
    gh variable set AWS_CLOUDFRONT_DISTRIBUTION_ID --repo ${var.github_repository} --env ${env} --body "${aws_cloudfront_distribution.frontend[env].id}"
%{endfor~}
  EOT
}
