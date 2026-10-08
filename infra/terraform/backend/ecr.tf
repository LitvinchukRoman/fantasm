resource "aws_ecr_repository" "api" {
  name                 = "${var.project_name}-api"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

# Tags are immutable (sha-<commit>), so a deployed tag always means the same
# bytes. Keep a generous window: rollback needs the previous prod image to still exist.
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 40 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 40
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_ecr_repository" "frontend" {
  name                 = "${var.project_name}-frontend"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "frontend" {
  repository = aws_ecr_repository.frontend.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 40 immutable frontend images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 40
      }
      action = { type = "expire" }
    }]
  })
}

# BuildKit must overwrite its cache manifest, which is incompatible with the
# immutable release repository. Keep cache blobs in a dedicated mutable repo.
resource "aws_ecr_repository" "frontend_cache" {
  name                 = "${var.project_name}-frontend-cache"
  image_tag_mutability = "MUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "frontend_cache" {
  repository = aws_ecr_repository.frontend_cache.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire orphaned cache layers after seven days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep five cache manifests"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["buildcache"]
          countType     = "imageCountMoreThan"
          countNumber   = 5
        }
        action = { type = "expire" }
      },
    ]
  })
}
