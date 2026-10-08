# One small box for both environments: Caddy (TLS, origin check, rate limits)
# plus two API containers (prod :8080, dev :8081, loopback only). The host is
# configured by the SSM document in host.tf, not by user data, so config changes
# do not replace the instance. No SSH key pair: access is SSM Session Manager.
check "container_memory_headroom" {
  assert {
    condition     = (2 * var.api_memory_mb) + (2 * var.frontend_memory_mb) <= 1536
    error_message = "API + frontend Docker limits must leave at least 512 MiB of t4g.small RAM for the host."
  }
}

resource "aws_instance" "backend" {
  ami                    = data.aws_ami.al2023_arm.id
  instance_type          = var.instance_type
  subnet_id              = sort(data.aws_subnets.public.ids)[0]
  vpc_security_group_ids = [aws_security_group.backend.id]
  iam_instance_profile   = aws_iam_instance_profile.backend.name

  # Credits are capped (no unlimited-mode surprise bill). Go + Caddy idle far
  # below the baseline; the alarm in monitoring.tf fires if the balance drains.
  credit_specification {
    cpu_credits = "standard"
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_gb
    encrypted             = true
    delete_on_termination = true
  }

  # IMDSv2 only, hop limit 1: containers (one extra hop) cannot reach the
  # instance credentials. The awslogs driver and the ECR helper run on the host.
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  tags = { Name = "${var.project_name}-backend" }

  lifecycle {
    ignore_changes = [ami]
  }
}

resource "aws_eip" "backend" {
  domain = "vpc"
  tags   = { Name = "${var.project_name}-backend" }
}

resource "aws_eip_association" "backend" {
  instance_id   = aws_instance.backend.id
  allocation_id = aws_eip.backend.id
}
