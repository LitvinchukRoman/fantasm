# Інфраструктура Fantasm

Два незалежні Terraform-стеки в одному AWS-акаунті (профіль `personal`, `eu-central-1`, зона `naukma.com`). Два середовища: `prod` і `dev`.

| Стек | Каталог | Стейт (`naukma-coffee-terraform-state-v2`) | Що в ньому |
|---|---|---|---|
| edge | [`edge/`](edge) | `fantasm/frontend/terraform.tfstate` | S3 + CloudFront + ACM + DNS для обох середовищ, OIDC-ролі деплою, секрет origin, опційний WAF |
| backend | [`backend/`](backend) | `fantasm/backend/terraform.tfstate` | EC2 (Caddy + Go), RDS, ECR, SSM, моніторинг |

Порядок **apply: спочатку edge, потім backend**. Backend читає ролі `fantasm-deploy-{dev,prod}` та OIDC-провайдер, створені в edge, а EC2 читає в SSM секрет `/fantasm/<env>/edge/origin-secret`, який теж пише edge. Зворотної залежності немає: CloudFront знає лише ім'я origin-хоста (`fantasm-origin[-dev].naukma.com`), не його стейт.

## Схема

```mermaid
flowchart LR
  user[Browser] --> cf["CloudFront: fantasm.naukma.com, fantasm-dev.naukma.com"]
  cf -->|"/assets/*"| s3["S3 per env, private, OAC"]
  cf -->|"pages (SSR) and /api/* + origin secret"| caddy["EC2 t4g.small: Caddy"]
  subgraph ec2 [one box, EIP, no SSH]
    caddy -->|"127.0.0.1:8080"| apiProd["api-prod container"]
    caddy -->|"127.0.0.1:8081"| apiDev["api-dev container"]
    caddy -->|"127.0.0.1:3000"| feProd["frontend-prod container"]
    caddy -->|"127.0.0.1:3001"| feDev["frontend-dev container"]
  end
  apiProd --> rds[("RDS db.t4g.micro: fantasm_prod, fantasm_dev")]
  apiDev --> rds
```

Фронтенд і API стоять за одним хостом (same-origin), тому `__Host-` cookie сесії та OIDC callback `/api/auth/{google|entra}/callback` працюють без CORS.

`dev` і `prod` мають однакову архітектуру: той самий CloudFront-конфіг, той самий Caddy-блок, однакові контейнери й деплой-пайплайни. Відрізняються лише хост, дані (окремі бази), розмір пулу БД і rate limit (prod більший), а поза prod CloudFront додає `X-Robots-Tag: noindex`.

## Захист бекенду

Три шари, кожен рятує наступний:

1. **Edge.** Порт 443 на EC2 відкритий лише для префікс-ліста CloudFront (`com.amazonaws.global.cloudfront.origin-facing`). Цей список спільний для всіх клієнтів CloudFront, тому Caddy ще й вимагає заголовок `X-Fantasm-Origin` з секретом, який CloudFront додає до кожного `/api/*`. Без нього — 403. SSH немає зовсім: доступ через SSM Session Manager. IMDSv2 з hop limit 1 (контейнери не бачать ключів інстанса).
2. **Caddy** ([`backend/host/Caddyfile.tpl`](backend/host/Caddyfile.tpl)). Адреса клієнта береться з `X-Forwarded-For` лише від CloudFront (`trusted_proxies cloudfront` + strict), далі `rate_limit`: глобальна стеля на секунду для середовища, ліміт на IP за хвилину, окремий жорсткіший ліміт на `/api/auth/{provider}/login` і `/callback`. Тіло запиту до 1 MB, таймаути до Go. Caddy перезаписує `X-Forwarded-For` перевіреною адресою, тож Go бачить одне непідробне значення.
3. **Контейнери.** Go має власні ліміти, таймаути й `DB_MAX_CONNS` (prod 8, dev 4). API обмежені 256 MiB кожен, Node SSR — 384 MiB кожен; разом 1280 MiB, тому на `t4g.small` лишається приблизно 768 MiB для ОС, Docker і Caddy. Усі контейнери `--read-only`, `--cap-drop ALL`, `no-new-privileges`. Node використовує host network лише щоб `API_INTERNAL_URL=http://127.0.0.1:<api-port>` не виходив із хоста; `HOST=127.0.0.1` не відкриває Node-порти назовні.

Ліміти за замовчуванням у [`backend/variables.tf`](backend/variables.tf): `rate_limit_ip_per_min = 600` (університетський NAT ділить одну адресу між багатьма студентами, тому щедро), `rate_limit_auth_per_min = 20`, `rate_limit_global_per_sec` prod 300 / dev 50. Якщо під атакою цього мало, `enable_waf = true` в edge підключає WAFv2 (rate-based правило + AWS Common Rule Set, ~7 USD/міс).

Окремо: SG-правило з префікс-лістом CloudFront рахується як ~55 правил з квоти 60 на SG. Тому SG `fantasm-backend` призначений лише для цього.

## База даних

Один RDS `fantasm-db` (Postgres 17, `db.t4g.micro`, gp3 20 GB, шифрований, бекап 7 днів, `deletion_protection`). Усередині дві бази, `fantasm_prod` і `fantasm_dev`, з окремими ролями-власниками. `CONNECT` відкликано з `PUBLIC`, тож dev-роль не відкриє prod-базу. Базу і ролі створює `init-db` на боксі (ідемпотентно, перед кожним деплоєм). З'єднання з `sslmode=verify-full` і CA-бандлом RDS.

DynamoDB свідомо не використано: домен реляційний (голоси, коментарі, модерація, `hot_score`), міграції на golang-migrate.

## Застосувати

```bash
# 1) edge
cd infra/terraform/edge
terraform init -reconfigure -backend-config=backend.hcl
terraform plan          # очікувано: 0 destroy; prod лише змінюється (moved-блоки)
terraform apply

# 2) створити GitHub environments і змінні (команди в output)
terraform output -raw github_environment_commands
# додай required reviewer для environment prod: Settings -> Environments -> prod

# 3) backend
cd ../backend
terraform init -reconfigure -backend-config=backend.hcl
terraform plan -var alert_email=you@example.com
terraform apply -var alert_email=you@example.com
terraform output -raw github_environment_commands
```

Після першого apply backend: SSM-асоціація сама налаштує бокс (Docker, Caddy, скрипти) через 1–3 хвилини після старту. Перевірка і ручний повторний запуск:

```bash
$(terraform output -raw configure_host_command)
aws ssm list-command-invocations --details --max-items 1   # статус і вивід
```

Якщо edge ще не застосований, конфігурація зупиниться з повідомленням `origin secrets missing in SSM`. Це очікувано.

### OAuth

Клієнти реєструються вручну; redirect URI для кожного середовища:

- `https://fantasm.naukma.com/api/auth/google/callback`, `https://fantasm.naukma.com/api/auth/entra/callback`
- `https://fantasm-dev.naukma.com/api/auth/google/callback`, `https://fantasm-dev.naukma.com/api/auth/entra/callback`

```bash
aws ssm put-parameter --overwrite --type SecureString \
  --name /fantasm/dev/app/google-client-id --value '...'
# те саме для google-client-secret, entra-client-id, entra-client-secret
```

Значення `unset` означає «провайдер вимкнений» (маршрут входу відповідає 404). Нові значення підхопляться при наступному деплої (`refresh-env`).

## Змінні GitHub

Задаються **на рівні environment** (`dev`, `prod`), не репозиторію. Точний набір для frontend workflow: `VITE_SITE_URL`, `AWS_DEPLOY_ROLE_ARN`, `AWS_FRONTEND_BUCKET`, `FRONTEND_ECR_REPOSITORY`, `FRONTEND_ECR_CACHE`, `EC2_INSTANCE_ID`, `FRONTEND_SSM_DEPLOY_DOCUMENT`. Backend workflow додатково використовує `ECR_REPOSITORY` і `SSM_DEPLOY_DOCUMENT`. `AWS_CLOUDFRONT_DISTRIBUTION_ID` лишається корисним для операційного виводу, але frontend workflow більше не інвалідує hashed assets. Секретів GitHub для деплою немає: AWS доступ — OIDC, application/OAuth секрети — SSM. Обидва `github_environment_commands` outputs задають усі значення.

## Деплой

| Подія | Що відбувається |
|---|---|
| merge у `main` (`frontend/` або frontend deploy files) | `deploy-frontend-dev.yaml`: typecheck/tests/build/SEO, нативна arm64 image `dev-sha-<commit>`, ECR registry cache, immutable `/assets` у S3, SSM deploy з rollback, public smoke |
| успішний dev frontend на `main` | `deploy-frontend-prod.yaml` (`workflow_run`): той самий коміт, окрема image `prod-sha-<commit>` (prod URL baked in), assets, SSM deploy з rollback, smoke. Вручну — `workflow_dispatch` |
| merge у `main` (`backend/`) | `deploy-backend-dev.yaml`: збірка arm64, grype, пуш `fantasm-api:sha-<commit>` (immutable), деплой у dev через SSM, smoke через CloudFront |
| успішний dev backend на `main` | `deploy-backend-prod.yaml` (`workflow_run`): та сама image без перезбірки, повторний grype, `release-<sha>`, SSM deploy, smoke. Вручну — rollback на `release-<sha>` |

Smoke фронтенду падає, якщо `/` віддає S3 замість Node, тож розходження архітектури середовищ ламає CI.

Frontend release ECR immutable. BuildKit cache винесений у окремий mutable `fantasm-frontend-cache`, бо cache manifest треба перезаписувати; обидва репозиторії мають scanning і lifecycle. Ролі `fantasm-deploy-dev/prod` можуть push лише ці ECR repositories та запускати тільки свій `fantasm-deploy-frontend-<env>` document.

## SSR на CloudFront

Default behavior обох дистрибутивів іде на EC2-origin з disabled cache і forward усіх cookies/query/viewer headers крім Host; Caddy відновлює публічний Host для Node. `/api/*` має окремий behavior (той самий origin, без кешу), `/assets/*` — S3 з immutable cache. Custom error responses немає: статуси й тіла помилок віддають Node та Go. Статичного S3-режиму більше немає (prod переведено на SSR 2026-10-08); S3 зберігає лише `/assets`.

Відкат фронтенду — контейнерний: `deploy-frontend` на боксі сам повертає попередню image, якщо нова не стала healthy; вручну — `deploy-frontend-prod.yaml` з потрібного коміту (`prod-sha-<commit>` immutable, повторний запуск бере готову image з ECR).

Роль кожного середовища може запускати лише власний SSM-документ `fantasm-deploy-api-<env>`, а не довільні команди (dev-роль не може виконати код на боксі, де живе prod). Тег перевіряє SSM (`^(sha|release)-[0-9a-f]{7,40}$`).

### Відкат

`deploy-api` на боксі сам повертає попередній образ, якщо новий не став `healthy` за 30 с, і завершується кодом 1. Ручний відкат на відомий тег: запустити `deploy-backend-prod.yaml` зі старим `image_tag` (ECR зберігає останні 40 образів; `release-*` аліаси позначають промотовані).

### Логи і доступ

- Логи API: CloudWatch `/fantasm/<env>/api` (14 днів).
- Шелл на боксі: `aws ssm start-session --target $(terraform output -raw instance_id)`. SSH немає.
- Алерти (SNS на `alert_email`, підтвердь підписку з пошти): статус EC2, CPU credits, вільне місце/памʼять/з'єднання RDS, бюджет по тегу `Project` (треба активувати cost allocation tag у Billing).

## Обмеження, про які варто памʼятати

- Один `t4g.small` обслуговує dev і prod API+SSR. Деплої та lock/state/container names розділені, але падіння або reboot хоста вимикає обидва середовища. Зміна `t4g.micro` -> `t4g.small` відбувається in-place із кількахвилинною зупинкою.
- Стек backend живе в спільній VPC `naukma-coffee-*` (підмережі та SG-якір `naukma-coffee-rds-sg`). Знесення random-coffee-стека зачепить і його.
- Cutover на `ideas.naukma.com`: змінити `hostnames["prod"]` в `edge`, `public_hostnames["prod"]` в `backend`, перезібрати фронтенд з `VITE_SITE_URL=https://ideas.naukma.com`, зареєструвати нові redirect URI, 301 зі старого хоста. Legacy-стек `naukma-ideas` знищується окремо після `pg_dump` його бази.
