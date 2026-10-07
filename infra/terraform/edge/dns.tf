resource "aws_acm_certificate" "frontend" {
  for_each = local.envs

  provider          = aws.us_east_1
  domain_name       = each.value.hostname
  validation_method = "DNS"
  tags              = merge(local.tags, { Environment = each.key })

  lifecycle {
    create_before_destroy = true
  }
}

# Keyed by domain name (unique across environments), same key the single-env
# stack used, so the existing prod validation record keeps its address.
resource "aws_route53_record" "cert_validation" {
  for_each = merge([
    for cert in aws_acm_certificate.frontend : {
      for dvo in cert.domain_validation_options : dvo.domain_name => {
        name   = dvo.resource_record_name
        record = dvo.resource_record_value
        type   = dvo.resource_record_type
      }
    }
  ]...)

  zone_id         = data.aws_route53_zone.root.zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 300
  records         = [each.value.record]
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "frontend" {
  for_each = local.envs

  provider        = aws.us_east_1
  certificate_arn = aws_acm_certificate.frontend[each.key].arn
  validation_record_fqdns = [
    for dvo in aws_acm_certificate.frontend[each.key].domain_validation_options :
    aws_route53_record.cert_validation[dvo.domain_name].fqdn
  ]
}

resource "aws_route53_record" "frontend_a" {
  for_each = local.envs

  zone_id = data.aws_route53_zone.root.zone_id
  name    = each.value.hostname
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend[each.key].domain_name
    zone_id                = aws_cloudfront_distribution.frontend[each.key].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "frontend_aaaa" {
  for_each = local.envs

  zone_id = data.aws_route53_zone.root.zone_id
  name    = each.value.hostname
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.frontend[each.key].domain_name
    zone_id                = aws_cloudfront_distribution.frontend[each.key].hosted_zone_id
    evaluate_target_health = false
  }
}
