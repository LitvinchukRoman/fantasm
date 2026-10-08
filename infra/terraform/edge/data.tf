data "aws_caller_identity" "current" {}

data "aws_route53_zone" "root" {
  name = var.domain_name
}

locals {
  github_owner = split("/", var.github_repository)[0]
  github_name  = split("/", var.github_repository)[1]

  # One entry per deployment environment. Prod keeps the pre-existing resource
  # names (empty suffix) so the move from single-env to for_each is in-place.
  envs = {
    for env, hostname in var.hostnames : env => {
      hostname  = hostname
      redirects = var.redirect_hostnames[env]
      suffix    = env == "prod" ? "" : "-${env}"
      bucket    = "${var.project_name}-frontend${env == "prod" ? "" : "-${env}"}-${data.aws_caller_identity.current.account_id}"
      site_url  = "https://${hostname}"
    }
  }

  # hostname => env whose distribution answers it (canonical and redirect)
  site_hosts = merge(
    { for env, hostname in var.hostnames : hostname => env },
    [for env, hosts in var.redirect_hostnames : { for host in hosts : host => env }]...
  )

  tags = {
    Project   = var.project_name
    Stack     = "edge"
    ManagedBy = "terraform"
  }
}

# Managed CloudFront policies for the /api/* behavior.
data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

# Forwards every viewer header, cookie and query string except Host, so the
# origin sees its own hostname (needed for Caddy's site matching and TLS).
data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}
