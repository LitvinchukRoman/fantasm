data "aws_caller_identity" "current" {}

data "aws_route53_zone" "root" {
  name = var.domain_name
}

locals {
  bucket_name  = "${var.project_name}-frontend-${data.aws_caller_identity.current.account_id}"
  site_url     = "https://${var.hostname}"
  github_owner = split("/", var.github_repository)[0]
  github_name  = split("/", var.github_repository)[1]
  tags = {
    Project = var.project_name
    Stack   = "frontend"
  }
}
