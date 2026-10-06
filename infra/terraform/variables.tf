variable "aws_region" {
  description = "Region for the frontend bucket. CloudFront itself is global; the certificate is forced to us-east-1."
  type        = string
  default     = "eu-central-1"
}

variable "aws_profile" {
  description = "AWS CLI profile for local plan/apply. The same account as naukma-ideas (profile personal)."
  type        = string
  default     = "personal"
}

variable "project_name" {
  description = "Prefix for resource names."
  type        = string
  default     = "fantasm"
}

variable "domain_name" {
  description = "Existing Route53 zone. Owned by the random-coffee stack; this stack only adds records."
  type        = string
  default     = "naukma.com"
}

variable "hostname" {
  description = "Public hostname for the static frontend. ideas.naukma.com stays on the MVP and is not managed here."
  type        = string
  default     = "fantasm.naukma.com"
}

variable "github_repository" {
  description = "GitHub repository allowed to assume the deploy role, owner/name."
  type        = string
  default     = "LitvinchukRoman/fantasm"
}

variable "github_owner_id" {
  description = "Numeric GitHub user id. Repos created after 2026-07-15 put it in the OIDC sub claim."
  type        = string
  default     = "198748414"
}

variable "github_repository_id" {
  description = "Numeric GitHub repository id, included in the immutable OIDC sub claim."
  type        = string
  default     = "1382305948"
}

variable "github_deploy_branch" {
  description = "Only this branch's GitHub Actions token may publish the frontend."
  type        = string
  default     = "main"
}
