data "aws_caller_identity" "current" {}

data "aws_route53_zone" "root" {
  name = var.domain_name
}

# The account has TWO VPCs tagged Name=naukma-coffee-vpc (one is an empty
# leftover). Anchor on the security group instead: it identifies the VPC that
# actually hosts the shared subnets.
data "aws_security_group" "vpc_anchor" {
  filter {
    name   = "tag:Name"
    values = [var.shared_rds_sg_name]
  }
}

data "aws_vpc" "shared" {
  id = data.aws_security_group.vpc_anchor.vpc_id
}

data "aws_subnets" "public" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.shared.id]
  }
  filter {
    name   = "tag:Name"
    values = [var.shared_public_subnet_name_prefix]
  }
}

data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.shared.id]
  }
  filter {
    name   = "tag:Name"
    values = [var.shared_private_subnet_name_prefix]
  }
}

# Newest Amazon Linux 2023 ARM64 AMI (Graviton, t4g).
data "aws_ami" "al2023_arm" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-arm64"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
  filter {
    name   = "architecture"
    values = ["arm64"]
  }
}

# CloudFront's address ranges as a managed prefix list. Shared by every
# CloudFront customer, so the origin ALSO checks a secret header (see edge stack).
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

# Deploy roles are created by the edge stack (they own the frontend bucket and
# distribution ARNs); this stack adds the API deploy permissions to them.
data "aws_iam_role" "deploy" {
  for_each = local.envs
  name     = "${var.project_name}-deploy-${each.key}"
}

locals {
  account_id = data.aws_caller_identity.current.account_id

  # Per-environment settings on the single box. Ports are bound to 127.0.0.1
  # and only Caddy talks to them.
  envs = {
    prod = {
      db_name       = "fantasm_prod"
      db_role       = "fantasm_prod"
      api_port      = 8080
      frontend_port = 3000
    }
    dev = {
      db_name       = "fantasm_dev"
      db_role       = "fantasm_dev"
      api_port      = 8081
      frontend_port = 3001
    }
  }

  ecr_registry = "${local.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
}
