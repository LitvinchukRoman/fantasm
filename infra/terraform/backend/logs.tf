# Created here (not by the Docker awslogs driver) so retention is bounded and
# the instance role does not need logs:CreateLogGroup.
resource "aws_cloudwatch_log_group" "api" {
  for_each = local.envs

  name              = "/${var.project_name}/${each.key}/api"
  retention_in_days = 14
}
