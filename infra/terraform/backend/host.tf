# Host configuration lives in an SSM Run Command document instead of EC2 user
# data: changing a script is `terraform apply` + a re-run, not an instance
# replacement (which would drop prod). The same document is re-run daily by the
# association, so the box converges back to this definition.
#
#   aws ssm send-command --document-name fantasm-configure-host \
#     --targets Key=InstanceIds,Values=$(terraform output -raw instance_id)

locals {
  host_env = {
    REGION           = var.aws_region
    PROJECT          = var.project_name
    ECR_REPO         = aws_ecr_repository.api.repository_url
    ORIGIN_HOST_PROD = var.origin_hostnames["prod"]
    ORIGIN_HOST_DEV  = var.origin_hostnames["dev"]
    PORT_PROD        = local.envs["prod"].api_port
    PORT_DEV         = local.envs["dev"].api_port
    POOL_PROD        = var.db_pool_max_conns["prod"]
    POOL_DEV         = var.db_pool_max_conns["dev"]
    API_MEMORY       = "${var.api_memory_mb}m"
    API_MEMORY_SWAP  = "${floor(var.api_memory_mb * 1.5)}m"
    RL_GLOBAL_PROD   = var.rate_limit_global_per_sec["prod"]
    RL_GLOBAL_DEV    = var.rate_limit_global_per_sec["dev"]
    RL_IP_PER_MIN    = var.rate_limit_ip_per_min
    RL_AUTH_PER_MIN  = var.rate_limit_auth_per_min
    ACME_EMAIL       = var.acme_email
    # Networks the API believes for X-Forwarded-For (TRUSTED_PROXY_CIDRS): the Docker bridge
    # (Caddy reaches the published loopback port through it) and loopback.
    TRUSTED_PROXIES = "172.16.0.0/12,127.0.0.1/32"
  }

  host_env_file = join("\n", [for k, v in local.host_env : "${k}=${v}"])

  # path on the box => [mode, source]. Every file is shipped gzip+base64 so the
  # shell scripts need no escaping inside the document.
  host_files = {
    "/usr/local/lib/fantasm/common.sh"         = ["644", file("${path.module}/host/common.sh")]
    "/usr/local/lib/fantasm/configure-host.sh" = ["755", file("${path.module}/host/configure-host.sh")]
    "/usr/local/lib/fantasm/deploy-api.sh"     = ["755", file("${path.module}/host/deploy-api.sh")]
    "/usr/local/lib/fantasm/refresh-env.sh"    = ["755", file("${path.module}/host/refresh-env.sh")]
    "/usr/local/lib/fantasm/init-db.sh"        = ["755", file("${path.module}/host/init-db.sh")]
    "/usr/local/lib/fantasm/Caddyfile.tpl"     = ["644", file("${path.module}/host/Caddyfile.tpl")]
    "/usr/local/lib/fantasm/caddy.service"     = ["644", file("${path.module}/host/caddy.service")]
  }

  host_commands = concat(
    ["set -euo pipefail", "mkdir -p /etc/fantasm /opt/fantasm /usr/local/lib/fantasm"],
    ["echo '${base64gzip(local.host_env_file)}' | base64 -d | gunzip > /etc/fantasm/host.env && chmod 644 /etc/fantasm/host.env"],
    [for path, f in local.host_files :
    "echo '${base64gzip(f[1])}' | base64 -d | gunzip > ${path} && chmod ${f[0]} ${path}"],
    ["bash /usr/local/lib/fantasm/configure-host.sh"],
  )
}

resource "aws_ssm_document" "configure_host" {
  name            = "${var.project_name}-configure-host"
  document_type   = "Command"
  document_format = "JSON"

  content = jsonencode({
    schemaVersion = "2.2"
    description   = "Install and configure the fantasm API host (Docker, Caddy, deploy scripts). Idempotent."
    mainSteps = [{
      action = "aws:runShellScript"
      name   = "configure"
      inputs = {
        timeoutSeconds = "900"
        runCommand     = local.host_commands
      }
    }]
  })
}

resource "aws_ssm_association" "configure_host" {
  name                = aws_ssm_document.configure_host.name
  association_name    = "${var.project_name}-configure-host"
  schedule_expression = "rate(1 day)"

  targets {
    key    = "InstanceIds"
    values = [aws_instance.backend.id]
  }
}

# One deploy document per environment. The role of an environment may only run
# its own document, and the tag is validated by SSM before anything executes:
# no shell metacharacters can reach the box.
resource "aws_ssm_document" "deploy_api" {
  for_each = local.envs

  name            = "${var.project_name}-deploy-api-${each.key}"
  document_type   = "Command"
  document_format = "JSON"

  content = jsonencode({
    schemaVersion = "2.2"
    description   = "Deploy fantasm-api:<tag> to the ${each.key} environment (rolls back when unhealthy)."
    parameters = {
      tag = {
        type           = "String"
        description    = "Image tag, sha-<commit> or release-<commit>."
        allowedPattern = "^(sha|release)-[0-9a-f]{7,40}$"
      }
    }
    mainSteps = [{
      action = "aws:runShellScript"
      name   = "deploy"
      inputs = {
        timeoutSeconds = "600"
        runCommand     = ["/usr/local/bin/deploy-api ${each.key} {{ tag }}"]
      }
    }]
  })
}
