# ── Instance role ──

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backend" {
  name               = "${var.project_name}-backend-ec2"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

# Session Manager + Run Command (replaces SSH).
resource "aws_iam_role_policy_attachment" "backend_ssm_core" {
  role       = aws_iam_role.backend.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "backend" {
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPull"
    actions = [
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchCheckLayerAvailability",
    ]
    resources = [
      aws_ecr_repository.api.arn,
      aws_ecr_repository.frontend.arn,
    ]
  }

  # Both environments' parameters and the shared DB admin credentials; the box
  # runs both environments, so it needs both.
  statement {
    sid       = "ReadFantasmParameters"
    actions   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
    resources = ["arn:aws:ssm:${var.aws_region}:${local.account_id}:parameter/${var.project_name}/*"]
  }

  statement {
    sid     = "ApiLogs"
    actions = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = concat(
      [for g in aws_cloudwatch_log_group.api : "${g.arn}:*"],
      [for g in aws_cloudwatch_log_group.frontend : "${g.arn}:*"],
    )
  }
}

resource "aws_iam_role_policy" "backend" {
  name   = "${var.project_name}-backend"
  role   = aws_iam_role.backend.id
  policy = data.aws_iam_policy_document.backend.json
}

resource "aws_iam_instance_profile" "backend" {
  name = "${var.project_name}-backend-ec2"
  role = aws_iam_role.backend.name
}

# ── GitHub deploy roles: API permissions ──
# The roles themselves (OIDC trust pinned to the immutable sub + ref=main, and
# the frontend bucket/CloudFront permissions) belong to the edge stack. Here
# each environment's role gets: push to the shared ECR repo, and permission to
# run ONLY its own deploy document on the box. Not AWS-RunShellScript: a dev
# role must not be able to run arbitrary commands on a box that also hosts prod.

data "aws_iam_policy_document" "deploy_backend" {
  for_each = local.envs

  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPush"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      # The workflows ask "is this tag already in ECR?" before pushing or aliasing
      # (tags are immutable); without this the answer is always AccessDenied.
      "ecr:DescribeImages",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:PutImage",
    ]
    resources = [aws_ecr_repository.api.arn]
  }

  statement {
    sid = "EcrFrontendPush"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:DescribeImages",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:PutImage",
    ]
    resources = [
      aws_ecr_repository.frontend.arn,
      aws_ecr_repository.frontend_cache.arn,
    ]
  }

  statement {
    sid     = "RunDeployDocument"
    actions = ["ssm:SendCommand"]
    resources = [
      aws_ssm_document.deploy_api[each.key].arn,
      aws_instance.backend.arn,
    ]
  }

  statement {
    sid     = "RunFrontendDeployDocument"
    actions = ["ssm:SendCommand"]
    resources = [
      aws_ssm_document.deploy_frontend[each.key].arn,
      aws_instance.backend.arn,
    ]
  }

  statement {
    sid       = "ReadCommandResult"
    actions   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "deploy_backend" {
  for_each = local.envs

  name   = "${var.project_name}-backend-${each.key}"
  role   = data.aws_iam_role.deploy[each.key].id
  policy = data.aws_iam_policy_document.deploy_backend[each.key].json
}
