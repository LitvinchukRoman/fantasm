resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
  tags            = local.tags
}

data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # Fantasm was created after 2026-07-15, so the subject is immutable:
    # repo:OWNER@OWNER_ID/REPO@REPO_ID:environment:prod
    # (GET /repos/LitvinchukRoman/fantasm/actions/oidc/customization/sub).
    # A job with `environment:` does not put the branch into `sub`; `ref` is separate.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${local.github_owner}@${var.github_owner_id}/${local.github_name}@${var.github_repository_id}:environment:prod"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:ref"
      values   = ["refs/heads/${var.github_deploy_branch}"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name               = "${var.project_name}-frontend-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
  tags               = local.tags
}

data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "ListFrontendBucket"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.frontend.arn]
  }

  statement {
    sid = "WriteFrontendObjects"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:AbortMultipartUpload",
    ]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]
  }

  statement {
    sid       = "InvalidateFrontend"
    actions   = ["cloudfront:CreateInvalidation"]
    resources = [aws_cloudfront_distribution.frontend.arn]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "${var.project_name}-frontend-deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}
