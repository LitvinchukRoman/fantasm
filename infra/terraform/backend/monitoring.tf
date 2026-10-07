resource "aws_sns_topic" "alerts" {
  name = "${var.project_name}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  count = var.alert_email != "" ? 1 : 0

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_cloudwatch_metric_alarm" "ec2_status" {
  alarm_name          = "${var.project_name}-ec2-status-check-failed"
  alarm_description   = "API box failed an EC2 status check (system or instance)."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed"
  dimensions          = { InstanceId = aws_instance.backend.id }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "ec2_cpu_credits" {
  alarm_name          = "${var.project_name}-ec2-cpu-credit-balance-low"
  alarm_description   = "Burst credits nearly exhausted (standard mode throttles the CPU at zero)."
  namespace           = "AWS/EC2"
  metric_name         = "CPUCreditBalance"
  dimensions          = { InstanceId = aws_instance.backend.id }
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 3
  threshold           = 20
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "rds_storage" {
  alarm_name          = "${var.project_name}-rds-free-storage-low"
  alarm_description   = "Less than 3 GiB of free storage on fantasm-db."
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.identifier }
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 3 * 1024 * 1024 * 1024
  comparison_operator = "LessThanThreshold"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "rds_memory" {
  alarm_name          = "${var.project_name}-rds-freeable-memory-low"
  alarm_description   = "Less than 100 MiB freeable memory on fantasm-db."
  namespace           = "AWS/RDS"
  metric_name         = "FreeableMemory"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.identifier }
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 3
  threshold           = 100 * 1024 * 1024
  comparison_operator = "LessThanThreshold"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name          = "${var.project_name}-rds-connections-high"
  alarm_description   = "More than 60 connections (db.t4g.micro allows about 85; pools are 8 + 4)."
  namespace           = "AWS/RDS"
  metric_name         = "DatabaseConnections"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.identifier }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 60
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_budgets_budget" "monthly" {
  count = var.alert_email != "" ? 1 : 0

  name         = "${var.project_name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Needs the Project cost allocation tag to be activated in Billing.
  cost_filter {
    name   = "TagKeyValue"
    values = [format("user:Project$%s", var.project_name)]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}
