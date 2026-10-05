# Frontend: S3 + CloudFront

Публічний фронтенд — це пререндер `frontend/build/client` (React Router, `npm run build`). CloudFront віддає його з S3. Бекенд і EC2 у цей стек не входять: маршрути, яких немає в пререндері (`/u/:handle`, `/api`), відповідають 404.

Хост: `https://fantasm.naukma.com`. Запис `ideas.naukma.com` лишається на MVP і цим стеком не керується.

Той самий AWS-акаунт, що й naukma-ideas (профіль `personal`, зона `naukma.com`). Стейт окремий: `s3://naukma-coffee-terraform-state-v2/fantasm/frontend/terraform.tfstate`.

## Що стоїть

- Бакет приватний. Читає його лише CloudFront через Origin Access Control.
- Сертифікат ACM в `us-east-1`, перевірка DNS у наявній зоні.
- A і AAAA на CloudFront. HTTP/2 і HTTP/3, TLS 1.2+, редірект на HTTPS, PriceClass_100 (Європа, включно з Україною).
- Функція `functions/pretty-urls.js` повторює `frontend/server.js`: `/ideas/` → 301 `/ideas`, `/ideas` читає `ideas/index.html`. Файли з крапкою (`/assets/*`, `*.data`, `sitemap.xml`) не чіпає.
- Кеш береться з `Cache-Control` обʼєкта. CI ставить рік і `immutable` на `/assets`, `max-age=0` на HTML і `*.data`, годину на решту. Після публікації інвалідується `/*`.
- Відсутній ключ (S3 віддає 403 через OAC) CloudFront показує як 404 зі сторінкою `frontend/public/404.html`.
- Деплой — OIDC-роль `fantasm-frontend-deploy`. Джоб має `environment: prod`, тож `sub` токена — `repo:LitvinchukRoman/fantasm:environment:prod`, а окремий claim `ref` мусить бути `refs/heads/main`. Ключів доступу немає.

## Застосувати

```bash
cd infra/terraform
terraform init -reconfigure -backend-config=backend.hcl
terraform plan
terraform apply
```

Після apply вистав змінні репозиторію командами з output `github_variables`. Поки їх немає, джоб `deploy` не зможе асюмити роль.

## CI

`.github/workflows/ci.yml` на кожен pull request у `main` і на push у `main`:

| Чек | Що робить |
|---|---|
| `lint` | `oxlint` |
| `typecheck` | `react-router typegen` і `tsc` |
| `build` | `npm run build` і `npm run check:seo` |
| `actionlint` | лінтер самих workflow |
| `branch-name` | імʼя гілки: `feat/`, `fix/`, `chore/`, `infra/`, `docs/` і далі слова через дефіс. `main` і `dependabot/*` дозволені |

Імена чеків збігаються з ruleset `infra/github/main-ruleset.json`. Джоб `deploy` не є required check: на pull request він не запускається. На `main` він чекає зелені чеки, забирає зібраний `build/client` і публікує саме його.

Ruleset на `main`: без прямого push, без force-push, без видалення гілки, гілка має бути актуальною, обовʼязкові чеки. Окремого ревʼюера немає — репозиторій на одного власника. Адмін може змерджити свій pull request повз чеки (потрібно для першого завезення workflow, бо чеків ще немає на `main`).

Окремий ruleset GitHub на імʼя гілки тут недоступний: `branch_name_pattern` є лише в enterprise. Тому імʼя перевіряє джоб `branch-name`. Приклад гілки: `infra/frontend-static`.
