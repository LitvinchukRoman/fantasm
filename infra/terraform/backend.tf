# Separate state from naukma-ideas and random-coffee. Initialize with:
#   terraform init -reconfigure -backend-config=backend.hcl
terraform {
  backend "s3" {}
}
