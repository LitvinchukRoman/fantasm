# edge

Стек фронтенду і входу: S3 + CloudFront + ACM + Route53 для `prod` і `dev`, OIDC-ролі деплою, секрет origin, опційний WAF. Обидва дистрибутиви однакові: сторінки рендерить Node SSR на EC2-origin, `/api/*` іде в Go там само, з S3 віддаються лише immutable `/assets/*`. Єдина різниця між середовищами — `X-Robots-Tag: noindex` поза prod. CloudFront не змінювати вручну, лише через plan/apply цього стека. Повний опис, порядок apply і змінні GitHub — у [../README.md](../README.md).

```bash
terraform init -reconfigure -backend-config=backend.hcl
terraform plan
```

Стейт `fantasm/frontend/terraform.tfstate` не змінювався при переході на два середовища: адреси prod-ресурсів перенесено блоками `moved` у [moved.tf](moved.tf), тож `plan` не повинен показувати `destroy`.
