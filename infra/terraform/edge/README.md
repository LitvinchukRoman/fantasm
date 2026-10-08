# edge

Стек фронтенду і входу: S3 + CloudFront + ACM + Route53 для `prod` і `dev`, `/api/*` та SSR на EC2-origin, OIDC-ролі деплою, секрет origin, опційний WAF. `frontend_delivery_mode` навмисно має `dev = "ssr"`, `prod = "s3"`; перемикання prod — окремий reviewed plan/apply, не ручна зміна CloudFront. Повний опис, порядок apply і змінні GitHub — у [../README.md](../README.md).

```bash
terraform init -reconfigure -backend-config=backend.hcl
terraform plan
```

Стейт `fantasm/frontend/terraform.tfstate` не змінювався при переході на два середовища: адреси prod-ресурсів перенесено блоками `moved` у [moved.tf](moved.tf), тож `plan` не повинен показувати `destroy`.
