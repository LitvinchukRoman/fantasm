# CloudFront reaches the box through these names; Caddy gets Let's Encrypt
# certificates for them. They are independent of the public hostnames, so the
# ideas.naukma.com cutover does not touch this stack's DNS.
resource "aws_route53_record" "origin" {
  for_each = local.envs

  zone_id = data.aws_route53_zone.root.zone_id
  name    = var.origin_hostnames[each.key]
  type    = "A"
  ttl     = 60
  records = [aws_eip.backend.public_ip]
}
