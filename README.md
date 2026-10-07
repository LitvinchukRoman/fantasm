# Fantasm

Платформа ідей спільноти НаУКМА: від стартапів і волонтерства до книжкових клубів. Могилянці позначені окремо і мають перевагу в спільноті. Під ідеєю — обговорення.

Повний інтент, правила і те, що свідомо не переносимо з MVP, — у [FULL_CONTEXT.md](FULL_CONTEXT.md). Прочитай його перед першим змістовним кодом.

| Каталог | Що це |
| --- | --- |
| `frontend/` | новий клієнт, React + TypeScript |
| `backend/` | новий сервер, Go |
| `legacy/` | заморожений фронтенд MVP (Next.js). Не розвивати |
| `infra/` | Terraform: `edge/` (S3 + CloudFront, dev і prod) і `backend/` (EC2 з Caddy і Go, RDS, ECR). Деталі: [infra/terraform/README.md](infra/terraform/README.md) |

## Гілки

Ім'я гілки: `тип/короткий-опис`. Тип один із `feat`, `fix`, `chore`, `infra`, `docs`. Далі лише малі латинські літери, цифри і дефіси. Приклади: `feat/forum-thread`, `fix/ci-annotations`, `infra/frontend-static`.

`main` і гілки Dependabot (`dependabot/...`) цим правилом не обмежені. Перевіряє чек `Branch name` (`.github/workflows/branch-name.yaml`); без нього pull request у `main` не мерджиться. Окремий ruleset GitHub на ім'я гілки на персональному акаунті недоступний.

## CI/CD і безпека

Чеки блокують мердж. Дії GitHub закріплені за SHA коміту, образи Docker за digest, інструменти за версією.

Чеки (кожен — окремий workflow і окремий required check у ruleset `main`):

| Workflow | Коли працює | Степи |
| --- | --- | --- |
| `lint-frontend.yaml` | змінились `frontend/` або `.github/` | oxlint, typecheck |
| `lint-backend.yaml` | змінилось щось поза `frontend/` | gofmt, `go mod tidy`, `go vet`, golangci-lint з gosec, hadolint, actionlint |
| `security-frontend.yaml` | як `lint-frontend`, плюс щоночі | gitleaks по історії `frontend/`, підписи npm-реєстру, `npm audit` (CRITICAL валить), CodeQL TypeScript |
| `security-backend.yaml` | як `lint-backend`, плюс щоночі | gitleaks по історії поза `frontend/`, zizmor, govulncheck, CodeQL Go, grype по продакшен-образу (**CRITICAL із доступним фіксом валить**) |
| `build-frontend.yaml` | як `lint-frontend` | build, SEO-перевірка |
| `build-backend.yaml` | як `lint-backend` | `go build`, `go test -race` з PostgreSQL на arm64 (прод працює на Graviton) |
| `branch-name.yaml` | кожен PR | ім'я гілки за правилом вище |

Required check не можна пропустити фільтром шляхів: такий pull request чекав би на нього вічно. Тому кожен чек стартує завжди, а перший степ (`.github/scripts/changed.sh`) вирішує, чи є для нього робота; якщо ні, чек зелений за кілька секунд.

Деплой:

| Workflow | Коли | Що робить |
| --- | --- | --- |
| `deploy-frontend-dev.yaml` | merge у `main` зі змінами в `frontend/`, або вручну | збірка з dev-URL, S3 dev, інвалідація CloudFront |
| `deploy-frontend-prod.yaml` | лише вручну | збірка з prod-URL, S3 prod, інвалідація CloudFront |
| `deploy-backend-dev.yaml` | merge у `main` зі змінами в `backend/`, або вручну | збірка arm64-образу, grype, пуш `sha-<commit>` в ECR, деплой через SSM, smoke |
| `deploy-backend-prod.yaml` | лише вручну, тег образу з dev | повторний grype того самого образу, alias `release-<sha>`, деплой через SSM, smoke |

Залежності оновлює Dependabot (`.github/dependabot.yaml`): actions, npm, Go, Docker, Terraform, з затримкою 7 днів на нові релізи.

Кожен степ виконується, навіть якщо попередній упав, тож один запуск показує всі проблеми. Нічні запуски security-чеків ловлять нові CVE в коді, який не змінювався. Прод деплоїться лише вручну (environment `prod` з рев'юером); відкат: `deploy-backend-prod.yaml` з тегом `release-<sha>`, сканування для відкату пропускається, щоб сканер не блокував відкат.

Виняток із політики додається в `backend/.grype.yaml` з причиною і датою перегляду. Версію Node підіймають у `frontend/.node-version`; нічний `Security frontend` падає, якщо там не остання патч-версія гілки.

Щоб перевірки справді не пускали в `main`, їхні назви мають бути в обов'язкових перевірках ruleset `main`, а правило «Code scanning results» додає блок за новими критичними алертами CodeQL.

## Локально

Потрібні Docker (бекенд і PostgreSQL) та Node 24 LTS (фронтенд; точна версія в `frontend/.node-version`).

### 1. Бекенд і база

```bash
cd backend
cp .env.example .env
```

У `.env` заповни облікові дані хоча б одного провайдера входу (обидва поля пари):

| Змінна | Звідки |
| --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud Console → OAuth client типу Web |
| `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` | Microsoft Entra → App registration (any organizational directory and personal accounts), у secret бери *value*, не ID |

`PUBLIC_URL` у `.env.example` вже `http://localhost:5173`: браузер ходить на origin фронтенда, а Vite проксує `/api` на Go. Зареєструй у провайдерах такі redirect URI (тип Web):

- Google: `http://localhost:5173/api/auth/google/callback`
- Microsoft: `http://localhost:5173/api/auth/entra/callback`

Запуск:

```bash
docker compose up -d --build
curl -s localhost:8080/healthz
```

Compose піднімає PostgreSQL 17 і API на `:8080` та сам застосовує міграції. Після зміни `.env` повтори `docker compose up -d --build`, щоб API перезапустився з новим оточенням. Зупинити: `docker compose down` (дані бази лежать у volume `pgdata`; `docker compose down -v` видаляє й їх).

Без `.env` compose підставляє заглушки `your-google-client-id` / `your-entra-client-id`: провайдери будуть «увімкнені», але Google/Microsoft відхилять вхід. Це не помилка бекенду, а відсутні справжні облікові дані.

### 2. Фронтенд

```bash
cd frontend
npm install
npm run dev
```

Клієнт — [http://localhost:5173](http://localhost:5173), запити на `/api` і `/healthz` проксуються на `localhost:8080`. Порт 5173 має збігатися з `PUBLIC_URL`, інакше callback провайдера не знайде сесійну cookie.

### 3. Перевірка входу

Сторінки `/login` і `/register` у фронтенді поки що лише верстка (форма пошта/пароль нічого не відправляє, пароля на бекенді немає), тож вхід починай напряму через проксі, у тому ж браузері від початку до кінця:

1. Відкрий `http://localhost:5173/api/auth/google/login` (або `/api/auth/entra/login`).
2. Після входу браузер поверне на `/` фронтенду.
3. Відкрий `http://localhost:5173/api/me`: має повернути JSON із `handle`, `name`, `role`, `memberships`. Без сесії — `401`.

Вихід: `POST /api/auth/logout` із заголовком `Origin: http://localhost:5173`. Повна схема API — `backend/api/swagger.yaml`, деталі входу й перевірки через curl — [backend/internal/identity/README.md](backend/internal/identity/README.md).

### Що вже з’єднано, а що ні

- Бекенд: вхід через Google/Microsoft (OIDC + PKCE), сесії, `/api/me`, вихід — реалізовано й покрито тестами. Стрічка ідей, голоси, обговорення, модерація і сповіщення — лише каркас і схема БД, HTTP-маршрутів немає.
- Фронтенд: до `/api` він ще не звертається. Кнопки входу, відображення поточного користувача і вихід ще треба підключити до `/api/auth/*` та `/api/me`; ідеї беруться зі статичних даних.
