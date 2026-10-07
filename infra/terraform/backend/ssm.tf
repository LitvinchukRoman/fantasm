# Parameter tree read by the box at deploy time (refresh-env, init-db):
#   /fantasm/shared/db/*            RDS admin credentials (init-db only)
#   /fantasm/<env>/db/*             per-environment database and role
#   /fantasm/<env>/app/*            application settings and OAuth credentials
#   /fantasm/<env>/edge/origin-secret   written by the edge stack

resource "aws_ssm_parameter" "db_master_username" {
  name  = "/${var.project_name}/shared/db/master-username"
  type  = "String"
  value = aws_db_instance.main.username
}

resource "aws_ssm_parameter" "db_master_password" {
  name  = "/${var.project_name}/shared/db/master-password"
  type  = "SecureString"
  value = random_password.db_master.result
}

resource "random_password" "db_env" {
  for_each = local.envs

  length  = 32
  special = false
}

resource "aws_ssm_parameter" "db_host" {
  for_each = local.envs

  name  = "/${var.project_name}/${each.key}/db/host"
  type  = "String"
  value = aws_db_instance.main.address
}

resource "aws_ssm_parameter" "db_port" {
  for_each = local.envs

  name  = "/${var.project_name}/${each.key}/db/port"
  type  = "String"
  value = tostring(aws_db_instance.main.port)
}

resource "aws_ssm_parameter" "db_name" {
  for_each = local.envs

  name  = "/${var.project_name}/${each.key}/db/name"
  type  = "String"
  value = each.value.db_name
}

resource "aws_ssm_parameter" "db_username" {
  for_each = local.envs

  name  = "/${var.project_name}/${each.key}/db/username"
  type  = "String"
  value = each.value.db_role
}

resource "aws_ssm_parameter" "db_password" {
  for_each = local.envs

  name  = "/${var.project_name}/${each.key}/db/password"
  type  = "SecureString"
  value = random_password.db_env[each.key].result
}

# Keys cursor signatures and address hashes; the API refuses to start over
# HTTPS without at least 32 characters. Per environment, so a dev value never
# validates prod data. Rotating it invalidates outstanding cursors only.
resource "random_password" "app_secret" {
  for_each = local.envs

  length  = 48
  special = false
}

resource "aws_ssm_parameter" "app_secret" {
  for_each = local.envs

  name  = "/${var.project_name}/${each.key}/app/app-secret"
  type  = "SecureString"
  value = random_password.app_secret[each.key].result
}

resource "aws_ssm_parameter" "public_url" {
  for_each = local.envs

  name  = "/${var.project_name}/${each.key}/app/public-url"
  type  = "String"
  value = "https://${var.public_hostnames[each.key]}"
}

# OAuth clients are registered by hand (redirect URI
# https://<public host>/api/auth/{google|entra}/callback). SSM rejects empty
# values, so "unset" means "provider disabled" (refresh-env turns it into an
# empty variable and the API answers 404 for that provider's login route).
# Real values are put with `aws ssm put-parameter --overwrite`, never in Terraform.
locals {
  oauth_params = toset([
    "google-client-id",
    "google-client-secret",
    "entra-client-id",
    "entra-client-secret",
  ])
  oauth_param_keys = {
    for pair in setproduct(keys(local.envs), local.oauth_params) : "${pair[0]}/${pair[1]}" => {
      env  = pair[0]
      name = pair[1]
    }
  }
}

resource "aws_ssm_parameter" "oauth" {
  for_each = local.oauth_param_keys

  name  = "/${var.project_name}/${each.value.env}/app/${each.value.name}"
  type  = "SecureString"
  value = "unset"

  lifecycle {
    ignore_changes = [value]
  }
}
