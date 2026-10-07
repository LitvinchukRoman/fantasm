# Optional edge WAF. Off by default (enable_waf = false): Caddy rate limits per
# IP/route and Go has its own limiter. Flip the variable during an attack.
# CLOUDFRONT-scope web ACLs live in us-east-1.
resource "aws_wafv2_web_acl" "edge" {
  count = var.enable_waf ? 1 : 0

  provider    = aws.us_east_1
  name        = "${var.project_name}-edge"
  description = "Rate limit and common protections for the fantasm distributions"
  scope       = "CLOUDFRONT"
  tags        = local.tags

  default_action {
    allow {}
  }

  rule {
    name     = "per-ip-rate"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit                 = var.waf_rate_limit_per_5min
        aggregate_key_type    = "IP"
        evaluation_window_sec = 300
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-per-ip-rate"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "aws-common"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-aws-common"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project_name}-edge"
    sampled_requests_enabled   = true
  }
}
