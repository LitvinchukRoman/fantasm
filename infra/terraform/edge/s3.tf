resource "aws_s3_bucket" "frontend" {
  for_each = local.envs

  bucket = each.value.bucket
  tags   = merge(local.tags, { Environment = each.key })
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  for_each = local.envs

  bucket                  = aws_s3_bucket.frontend[each.key].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "frontend" {
  for_each = local.envs

  bucket = aws_s3_bucket.frontend[each.key].id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  for_each = local.envs

  bucket = aws_s3_bucket.frontend[each.key].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "frontend" {
  for_each = local.envs

  bucket = aws_s3_bucket.frontend[each.key].id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "frontend" {
  for_each = local.envs

  bucket = aws_s3_bucket.frontend[each.key].id

  rule {
    id     = "expire-noncurrent"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 14
    }
  }

  depends_on = [aws_s3_bucket_versioning.frontend]
}

# s3:ListBucket for the distribution makes S3 answer 404 (NoSuchKey) instead of
# 403 for a missing /assets/* key.
resource "aws_s3_bucket_policy" "frontend" {
  for_each = local.envs

  bucket = aws_s3_bucket.frontend[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontRead"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend[each.key].arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend[each.key].arn
          }
        }
      },
      {
        Sid       = "AllowCloudFrontList"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:ListBucket"
        Resource  = aws_s3_bucket.frontend[each.key].arn
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend[each.key].arn
          }
        }
      },
    ]
  })
}
