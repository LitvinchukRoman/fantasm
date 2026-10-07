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
