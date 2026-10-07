resource "aws_security_group" "backend" {
  name        = "${var.project_name}-backend"
  description = "Fantasm API box: HTTPS from CloudFront only, HTTP for ACME. No SSH (use SSM)."
  vpc_id      = data.aws_vpc.shared.id

  tags = { Name = "${var.project_name}-backend-sg" }
}

# CloudFront reaches Caddy here. The prefix list has ~55 entries and counts
# against the 60-rules-per-SG quota; keep this SG for this purpose only.
resource "aws_vpc_security_group_ingress_rule" "https_from_cloudfront" {
  security_group_id = aws_security_group.backend.id
  description       = "HTTPS from CloudFront origin-facing ranges"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront.id
}

# Let's Encrypt HTTP-01 validation comes from changing addresses, so port 80
# has to be open. Caddy answers only the ACME challenge and redirects.
resource "aws_vpc_security_group_ingress_rule" "http_acme" {
  security_group_id = aws_security_group.backend.id
  description       = "HTTP for ACME HTTP-01 and redirect"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "backend_all" {
  security_group_id = aws_security_group.backend.id
  description       = "ECR, SSM, CloudWatch, RDS, Lets Encrypt"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds"
  description = "Fantasm RDS PostgreSQL: access from the API box only"
  vpc_id      = data.aws_vpc.shared.id

  tags = { Name = "${var.project_name}-rds-sg" }
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_backend" {
  security_group_id            = aws_security_group.rds.id
  description                  = "PostgreSQL from the API box"
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.backend.id
}
