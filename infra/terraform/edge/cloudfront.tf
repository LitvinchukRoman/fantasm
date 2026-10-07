resource "aws_cloudfront_origin_access_control" "frontend" {
  for_each = local.envs

  name                              = "${var.project_name}-frontend${each.value.suffix}"
  description                       = "Read ${each.value.bucket} from CloudFront only"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_function" "pretty_urls" {
  name    = "${var.project_name}-frontend-pretty-urls"
  runtime = "cloudfront-js-2.0"
  comment = "Directory index and trailing-slash canonical for the prerendered frontend"
  publish = true
  code    = file("${path.module}/functions/pretty-urls.js")
}

# Origin Cache-Control decides the TTL (bounded by min/max below).
# CI sets immutable on /assets and max-age=0 on HTML and *.data.
resource "aws_cloudfront_cache_policy" "frontend" {
  name        = "${var.project_name}-frontend-origin-cache"
  comment     = "Honor object Cache-Control from the frontend publish"
  min_ttl     = 0
  default_ttl = 0
  max_ttl     = 31536000

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

resource "aws_cloudfront_response_headers_policy" "frontend" {
  for_each = local.envs

  name    = "${var.project_name}-frontend${each.value.suffix}-security"
  comment = "Baseline browser protections for the static frontend"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = false
      preload                    = false
      override                   = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      value    = "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
      override = true
    }
    items {
      header   = "X-Permitted-Cross-Domain-Policies"
      value    = "none"
      override = true
    }

    # Everything except prod stays out of search indexes, whatever the HTML says.
    dynamic "items" {
      for_each = each.key == "prod" ? [] : [1]
      content {
        header   = "X-Robots-Tag"
        value    = "noindex, nofollow"
        override = true
      }
    }
  }
}

resource "aws_cloudfront_distribution" "frontend" {
  for_each = local.envs

  enabled             = true
  comment             = "${var.project_name} frontend${each.value.suffix}"
  aliases             = [each.value.hostname]
  default_root_object = "index.html"
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  price_class         = "PriceClass_100"
  wait_for_deployment = true
  web_acl_id          = var.enable_waf ? aws_wafv2_web_acl.edge[0].arn : null
  tags                = merge(local.tags, { Environment = each.key })

  origin {
    domain_name              = aws_s3_bucket.frontend[each.key].bucket_regional_domain_name
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend[each.key].id
  }

  # EC2 API origin (Caddy -> Go). HTTPS only: Caddy holds a Let's Encrypt
  # certificate for the origin hostname.
  origin {
    domain_name = var.origin_hostnames[each.key]
    origin_id   = "api-origin"

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 30
      origin_keepalive_timeout = 5
    }

    custom_header {
      name  = "X-Fantasm-Origin"
      value = random_password.origin_secret[each.key].result
    }
  }

  default_cache_behavior {
    target_origin_id           = "s3-frontend"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    viewer_protocol_policy     = "redirect-to-https"
    cache_policy_id            = aws_cloudfront_cache_policy.frontend.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.frontend[each.key].id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.pretty_urls.arn
    }
  }

  # Same-origin API: the browser talks to one host, so __Host- session cookies
  # and the OIDC callback work without CORS. Never cached; cookies, query string
  # and Origin are forwarded. No pretty-urls function here.
  ordered_cache_behavior {
    path_pattern               = "/api/*"
    target_origin_id           = "api-origin"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    viewer_protocol_policy     = "redirect-to-https"
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.frontend[each.key].id
  }

  # Missing prerendered key: S3 answers 404 (the bucket policy grants ListBucket
  # to this distribution). Serve the static page with a real 404 so crawlers do
  # not index a soft 200. There is deliberately NO 403 rewrite: custom error
  # responses are distribution-wide and would hide genuine 403s from /api/*.
  # Trade-off: a 404 from /api/* also gets this HTML body (status stays 404), so
  # API clients must branch on the status code, not on the 404 body.
  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.frontend[each.key].certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
