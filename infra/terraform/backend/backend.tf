# Separate state from the edge stack. Initialize with:
#   terraform init -reconfigure -backend-config=backend.hcl
terraform {
  backend "s3" {}
}
