# Shared secret between CloudFront and the EC2 origin. CloudFront adds it as the
# X-Fantasm-Origin header on every /api/* request; Caddy answers 403 without it.
# The origin security group only admits CloudFront's address ranges, but those
# ranges are shared by every CloudFront customer, so the header is what proves
# the request came through THIS distribution.
#
# Owned here (not in the backend stack) so the two stacks have no cycle: the
# backend instance reads the parameter at runtime and needs no Terraform link.
resource "random_password" "origin_secret" {
  for_each = local.envs

  length  = 48
  special = false
}

resource "aws_ssm_parameter" "origin_secret" {
  for_each = local.envs

  name  = "/${var.project_name}/${each.key}/edge/origin-secret"
  type  = "SecureString"
  value = random_password.origin_secret[each.key].result
  tags  = merge(local.tags, { Environment = each.key })
}
