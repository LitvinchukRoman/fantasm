resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db"
  subnet_ids = data.aws_subnets.private.ids

  tags = { Name = "${var.project_name}-db-subnet-group" }

  lifecycle {
    precondition {
      condition     = length(data.aws_subnets.private.ids) >= 2
      error_message = "RDS needs private subnets in at least two AZs; found ${length(data.aws_subnets.private.ids)}."
    }
  }
}

resource "random_password" "db_master" {
  length  = 32
  special = false
}

# One instance, two databases (fantasm_prod, fantasm_dev) with separate owner
# roles; init-db on the box creates them. Dev cannot connect to prod.
resource "aws_db_instance" "main" {
  identifier     = "${var.project_name}-db"
  engine         = "postgres"
  engine_version = "17"
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage_gb
  max_allocated_storage = var.db_max_allocated_storage_gb
  storage_type          = "gp3"
  storage_encrypted     = true

  username = "fantasm_admin"
  password = random_password.db_master.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  multi_az            = false
  publicly_accessible = false

  backup_retention_period   = var.db_backup_retention_days
  backup_window             = "02:00-03:00"
  maintenance_window        = "mon:03:30-mon:04:30"
  copy_tags_to_snapshot     = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.project_name}-db-final"
  deletion_protection       = true

  auto_minor_version_upgrade   = true
  performance_insights_enabled = false

  tags = { Name = "${var.project_name}-db" }
}
