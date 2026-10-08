output "instance_id" {
  description = "API box instance id (SSM target)."
  value       = aws_instance.backend.id
}

output "public_ip" {
  description = "Elastic IP of the API box."
  value       = aws_eip.backend.public_ip
}

output "origin_hostnames" {
  description = "Origin hostname per environment (CloudFront -> Caddy)."
  value       = var.origin_hostnames
}

output "ecr_repository_url" {
  description = "ECR repository for the API image."
  value       = aws_ecr_repository.api.repository_url
}

output "frontend_ecr_repository_url" {
  description = "Immutable ECR repository for the arm64 SSR image."
  value       = aws_ecr_repository.frontend.repository_url
}

output "frontend_ecr_cache_url" {
  description = "Mutable ECR repository used only for BuildKit registry cache manifests."
  value       = aws_ecr_repository.frontend_cache.repository_url
}

output "rds_endpoint" {
  description = "RDS endpoint (private)."
  value       = aws_db_instance.main.address
}

output "deploy_documents" {
  description = "SSM deploy document per environment."
  value       = { for env, d in aws_ssm_document.deploy_api : env => d.name }
}

output "frontend_deploy_documents" {
  description = "Frontend SSM deploy document per environment."
  value       = { for env, d in aws_ssm_document.deploy_frontend : env => d.name }
}

output "oauth_parameters" {
  description = "SSM parameters that hold OAuth credentials; set them with put-parameter --overwrite (value 'unset' = provider disabled)."
  value       = [for p in aws_ssm_parameter.oauth : p.name]
}

output "github_environment_commands" {
  description = "Run as LitvinchukRoman after apply (edge stack output creates the environments first)."
  value       = <<-EOT
%{for env in keys(local.envs)~}
    gh variable set ECR_REPOSITORY   --repo LitvinchukRoman/fantasm --env ${env} --body "${aws_ecr_repository.api.repository_url}"
    gh variable set EC2_INSTANCE_ID  --repo LitvinchukRoman/fantasm --env ${env} --body "${aws_instance.backend.id}"
    gh variable set SSM_DEPLOY_DOCUMENT --repo LitvinchukRoman/fantasm --env ${env} --body "${aws_ssm_document.deploy_api[env].name}"
    gh variable set FRONTEND_ECR_REPOSITORY --repo LitvinchukRoman/fantasm --env ${env} --body "${aws_ecr_repository.frontend.repository_url}"
    gh variable set FRONTEND_ECR_CACHE      --repo LitvinchukRoman/fantasm --env ${env} --body "${aws_ecr_repository.frontend_cache.repository_url}"
    gh variable set FRONTEND_SSM_DEPLOY_DOCUMENT --repo LitvinchukRoman/fantasm --env ${env} --body "${aws_ssm_document.deploy_frontend[env].name}"
%{endfor~}
  EOT
}

output "configure_host_command" {
  description = "Re-run host configuration on demand."
  value       = "aws ssm send-command --profile ${var.aws_profile} --region ${var.aws_region} --document-name ${aws_ssm_document.configure_host.name} --targets Key=InstanceIds,Values=${aws_instance.backend.id}"
}
