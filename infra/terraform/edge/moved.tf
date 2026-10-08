# The stack used to be single-environment. Prod keeps its real resources; only
# the addresses change, so `terraform plan` must show no destroy for prod.
moved {
  from = aws_s3_bucket.frontend
  to   = aws_s3_bucket.frontend["prod"]
}
moved {
  from = aws_s3_bucket_public_access_block.frontend
  to   = aws_s3_bucket_public_access_block.frontend["prod"]
}
moved {
  from = aws_s3_bucket_ownership_controls.frontend
  to   = aws_s3_bucket_ownership_controls.frontend["prod"]
}
moved {
  from = aws_s3_bucket_server_side_encryption_configuration.frontend
  to   = aws_s3_bucket_server_side_encryption_configuration.frontend["prod"]
}
moved {
  from = aws_s3_bucket_versioning.frontend
  to   = aws_s3_bucket_versioning.frontend["prod"]
}
moved {
  from = aws_s3_bucket_lifecycle_configuration.frontend
  to   = aws_s3_bucket_lifecycle_configuration.frontend["prod"]
}
moved {
  from = aws_s3_bucket_policy.frontend
  to   = aws_s3_bucket_policy.frontend["prod"]
}
moved {
  from = aws_cloudfront_origin_access_control.frontend
  to   = aws_cloudfront_origin_access_control.frontend["prod"]
}
moved {
  from = aws_cloudfront_distribution.frontend
  to   = aws_cloudfront_distribution.frontend["prod"]
}
moved {
  from = aws_acm_certificate.frontend
  to   = aws_acm_certificate.frontend["prod"]
}
moved {
  from = aws_acm_certificate_validation.frontend
  to   = aws_acm_certificate_validation.frontend["prod"]
}
moved {
  from = aws_route53_record.frontend_a
  to   = aws_route53_record.frontend_a["prod"]
}
moved {
  from = aws_route53_record.frontend_aaaa
  to   = aws_route53_record.frontend_aaaa["prod"]
}
moved {
  from = aws_cloudfront_response_headers_policy.frontend
  to   = aws_cloudfront_response_headers_policy.frontend["prod"]
}

# DNS records are keyed by hostname since the ideas.naukma.com cutover; the
# existing fantasm[-dev].naukma.com records keep their real resources.
moved {
  from = aws_route53_record.frontend_a["prod"]
  to   = aws_route53_record.frontend_a["fantasm.naukma.com"]
}
moved {
  from = aws_route53_record.frontend_aaaa["prod"]
  to   = aws_route53_record.frontend_aaaa["fantasm.naukma.com"]
}
moved {
  from = aws_route53_record.frontend_a["dev"]
  to   = aws_route53_record.frontend_a["fantasm-dev.naukma.com"]
}
moved {
  from = aws_route53_record.frontend_aaaa["dev"]
  to   = aws_route53_record.frontend_aaaa["fantasm-dev.naukma.com"]
}
