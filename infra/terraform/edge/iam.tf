resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
  tags            = local.tags
}

# Trust policy per GitHub environment (dev, prod).
# Fantasm was created after 2026-07-15, so the subject is immutable:
#   repo:OWNER@OWNER_ID/REPO@REPO_ID:environment:<env>
# (GET /repos/LitvinchukRoman/fantasm/actions/oidc/customization/sub).
# A job with `environment:` does not put the branch into `sub`; `ref` is a
# separate claim, pinned to the deploy branch below.
data "aws_iam_policy_document" "github_assume" {
  for_each = local.envs

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
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${local.github_owner}@${var.github_owner_id}/${local.github_name}@${var.github_repository_id}:environment:${each.key}"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:ref"
      values   = ["refs/heads/${var.github_deploy_branch}"]
    }
  }
}

# Per-environment deploy roles stage immutable assets in that environment's
# bucket. The backend stack adds API/frontend ECR and scoped SSM deploy access.
resource "aws_iam_role" "deploy_env" {
  for_each = local.envs

  name               = "${var.project_name}-deploy-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.github_assume[each.key].json
  tags               = merge(local.tags, { Environment = each.key })
}

data "aws_iam_policy_document" "deploy_env" {
  for_each = local.envs

  statement {
    sid       = "ListFrontendBucket"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.frontend[each.key].arn]
  }

  statement {
    sid = "WriteFrontendObjects"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:AbortMultipartUpload",
    ]
    resources = ["${aws_s3_bucket.frontend[each.key].arn}/*"]
  }
}

resource "aws_iam_role_policy" "deploy_env" {
  for_each = local.envs

  name   = "${var.project_name}-frontend-${each.key}"
  role   = aws_iam_role.deploy_env[each.key].id
  policy = data.aws_iam_policy_document.deploy_env[each.key].json
}

# ---------------------------------------------------------------------------
# LEGACY: the original single-environment prod role. It stays only until the
# workflows use fantasm-deploy-prod / fantasm-deploy-dev (this change). Remove
# this role and its policy in a follow-up once the first deploy with the new
# roles has succeeded.
# ---------------------------------------------------------------------------
resource "aws_iam_role" "deploy" {
  name               = "${var.project_name}-frontend-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_assume["prod"].json
  tags               = local.tags
}

resource "aws_iam_role_policy" "deploy" {
  name   = "${var.project_name}-frontend-deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy_env["prod"].json
}
