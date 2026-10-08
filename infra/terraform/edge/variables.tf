variable "aws_region" {
  description = "Region for the frontend buckets. CloudFront itself is global; certificates are forced to us-east-1."
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

variable "hostnames" {
  description = "Public hostname per environment. ideas.naukma.com stays on the MVP until the cutover; then change prod here."
  type        = map(string)
  default = {
    prod = "fantasm.naukma.com"
    dev  = "fantasm-dev.naukma.com"
  }

  validation {
    condition     = toset(keys(var.hostnames)) == toset(["dev", "prod"])
    error_message = "hostnames must have exactly the keys dev and prod."
  }
}

variable "origin_hostnames" {
  description = "Hostname per environment that CloudFront uses to reach the EC2 API origin (DNS A record is owned by the backend stack). Must match backend/variables.tf."
  type        = map(string)
  default = {
    prod = "fantasm-origin.naukma.com"
    dev  = "fantasm-origin-dev.naukma.com"
  }

  validation {
    condition     = toset(keys(var.origin_hostnames)) == toset(["dev", "prod"])
    error_message = "origin_hostnames must have exactly the keys dev and prod."
  }
}

variable "enable_waf" {
  description = "Attach a WAFv2 web ACL (rate-based rule + AWS common rules) to both distributions. About 7 USD/month; off by default because Caddy and Go already rate limit."
  type        = bool
  default     = false
}

variable "waf_rate_limit_per_5min" {
  description = "Per-IP request cap per 5 minutes when enable_waf is true. Campus NAT shares an IP, keep this generous."
  type        = number
  default     = 3000
}

variable "github_repository" {
  description = "GitHub repository allowed to assume the deploy roles, owner/name."
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
  description = "Only this branch's GitHub Actions token may deploy."
  type        = string
  default     = "main"
}
