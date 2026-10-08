variable "aws_region" {
  description = "AWS region (eu-central-1 = Frankfurt), same as the rest of the account."
  type        = string
  default     = "eu-central-1"
}

variable "aws_profile" {
  description = "AWS CLI profile for local plan/apply."
  type        = string
  default     = "personal"
}

variable "project_name" {
  description = "Prefix for resource names and the SSM tree (/<project>/...)."
  type        = string
  default     = "fantasm"
}

variable "domain_name" {
  description = "Existing Route53 zone. Owned by the random-coffee stack; this stack only adds records."
  type        = string
  default     = "naukma.com"
}

variable "public_hostnames" {
  description = "Public (browser-facing) hostname per environment. Becomes PUBLIC_URL and the OIDC redirect origin. Change prod here at the ideas.naukma.com cutover (and in edge/variables.tf)."
  type        = map(string)
  default = {
    prod = "fantasm.naukma.com"
    dev  = "fantasm-dev.naukma.com"
  }
}

variable "origin_hostnames" {
  description = "Hostname per environment that CloudFront uses to reach this box. Caddy serves it with a Let's Encrypt certificate. Must match edge/variables.tf."
  type        = map(string)
  default = {
    prod = "fantasm-origin.naukma.com"
    dev  = "fantasm-origin-dev.naukma.com"
  }
}

# ── Compute ──

variable "instance_type" {
  description = "EC2 type for the shared API + SSR box. t4g.small provides 2 GiB for four bounded containers plus Caddy and the host."
  type        = string
  default     = "t4g.small"
}

variable "root_volume_gb" {
  description = "Root volume size (gp3, encrypted)."
  type        = number
  default     = 20
}

variable "api_memory_mb" {
  description = "Docker memory limit per API container (swap allowance is 1.5x)."
  type        = number
  default     = 256
}

variable "frontend_memory_mb" {
  description = "Docker memory limit per Node SSR container. Two API and two frontend limits total 1280 MiB, leaving about 768 MiB of t4g.small RAM for Caddy, Docker and the OS."
  type        = number
  default     = 384

  validation {
    condition     = var.frontend_memory_mb >= 256 && var.frontend_memory_mb <= 512
    error_message = "frontend_memory_mb must be between 256 and 512 MiB to preserve host headroom."
  }
}

variable "db_pool_max_conns" {
  description = "API pool size per environment (DB_MAX_CONNS). db.t4g.micro allows about 85 connections in total."
  type        = map(number)
  default = {
    prod = 8
    dev  = 4
  }
}

# ── Rate limiting (Caddy, per origin host) ──

variable "rate_limit_global_per_sec" {
  description = "Hard ceiling on requests per second to an environment's API, regardless of client. Protects the Go process and the DB pool."
  type        = map(number)
  default = {
    prod = 300
    dev  = 50
  }
}

variable "rate_limit_ip_per_min" {
  description = "Requests per minute per client IP. Campus NAT shares one IP between many students, keep it generous."
  type        = number
  default     = 600
}

variable "rate_limit_auth_per_min" {
  description = "Requests per minute per client IP on /api/auth/{provider}/login and /callback (each login starts an OIDC round-trip)."
  type        = number
  default     = 20
}

variable "acme_email" {
  description = "Optional contact e-mail for Let's Encrypt expiry notices."
  type        = string
  default     = ""
}

# ── Database ──

variable "db_instance_class" {
  description = "RDS instance class. db.t4g.micro is the cheapest Graviton class."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage_gb" {
  description = "Initial RDS storage (gp3)."
  type        = number
  default     = 20
}

variable "db_max_allocated_storage_gb" {
  description = "Storage autoscaling ceiling."
  type        = number
  default     = 40
}

variable "db_backup_retention_days" {
  description = "Automated backup retention."
  type        = number
  default     = 7
}

# ── Shared network (owned by the random-coffee stack) ──

variable "shared_rds_sg_name" {
  description = "Name tag of an existing security group in the shared VPC; anchors VPC discovery (the account has two VPCs with the same Name tag)."
  type        = string
  default     = "naukma-coffee-rds-sg"
}

variable "shared_public_subnet_name_prefix" {
  description = "Name-tag pattern of the shared public subnets the API box launches into."
  type        = string
  default     = "naukma-coffee-public-*"
}

variable "shared_private_subnet_name_prefix" {
  description = "Name-tag pattern of the shared private subnets for the RDS subnet group (needs two AZs)."
  type        = string
  default     = "naukma-coffee-private-*"
}

# ── Ops ──

variable "alert_email" {
  description = "E-mail for CloudWatch alarms and budget alerts. Empty disables the subscription and the budget. The subscription must be confirmed from the inbox."
  type        = string
  default     = ""
}

variable "monthly_budget_usd" {
  description = "Monthly cost budget for resources tagged Project=fantasm (requires the Project cost allocation tag to be activated in Billing)."
  type        = number
  default     = 40
}
