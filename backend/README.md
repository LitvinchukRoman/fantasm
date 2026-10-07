# backend

Go-сервер Fantasm: модульний моноліт з гексагональною архітектурою. Перший реалізований контекст — [identity](internal/identity/README.md): вхід через Google/Microsoft, сесії та поточний користувач. Інші контексти поки лишаються каркасом.

Правила продукту — у `../FULL_CONTEXT.md`.

## Запуск

```bash
cp .env.example .env
docker compose up -d --build
```

Compose запускає PostgreSQL і API на `http://localhost:8080`, чекає готовності бази та застосовує міграції. Перед запуском заповни `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` та/або `ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET` у `.env`. Без параметрів провайдер вимкнений: його маршрут входу повертає 404. Прив’язки до університету немає; об’єднання акаунтів Google і Microsoft відкладене.

Для frontend development `.env.example` задає `PUBLIC_URL=http://localhost:5173`. Зареєструй callback URL `http://localhost:5173/api/auth/google/callback` та/або `http://localhost:5173/api/auth/entra/callback`, запусти `npm run dev` у `frontend` і починай вхід через `http://localhost:5173/api/auth/google/login` або `/api/auth/entra/login`. Vite вже проксіює `/api` на backend. Сторінки входу у frontend поки що не звертаються до цих маршрутів (лише верстка), тому вхід починай напряму за URL вище. Для прямого використання API зміни `PUBLIC_URL` на `http://localhost:8080` і відповідно онови callback URL.

Налаштування callback URL, перевірка через curl та робота з frontend proxy описані в [identity](internal/identity/README.md#local-startup-and-curl-checks).

Для запуску Go поза Docker залишаються команди Task і golang-migrate CLI: `task db-up`, `task migrate-up`, `task run`. `task migrate-down` відкочує одну міграцію. `MIGRATE_ON_START=true` застосовує міграції на старті сервера.

## Правила організацій

Університетські бейджі, членство, дозволи та параметри переваг задаються у `config/organizations.json`. За замовчуванням правил немає. Готовий приклад НаУКМА — `config/organizations.example.json`; для ввімкнення потрібен справжній tenant ID. Після зміни правил перезапусти API. Формат, перевірка доказів та межі реалізації описані в [organization rules](internal/organizations/README.md).

## Структура

```
cmd/api/           точка входу
migrations/        golang-migrate
internal/platform/ apperr, config, postgres, migrate
internal/<ctx>/    identity, ideas, engagement, discussion, moderation, notifications, organizations
  service.go
  domain/
  ports/
  adapters/http/
  adapters/postgres/
```

У `identity` інтерфейси залежностей оголошені в `service.go`, де їх використовують; окремого `ports/` немає. `adapters/oidc/` реалізує перевірку провайдерів. Це зразок для наступних контекстів.

## Перевірка

```bash
go test -race ./...
go vet ./...
```

Інтеграційні тести використовують окремі тимчасові схеми в базі, заданій через `IDENTITY_TEST_DATABASE_URL`. Без цієї змінної вони пропускаються. Використовуй тестову базу, користувач якої може створювати й видаляти схеми.

```bash
IDENTITY_TEST_DATABASE_URL='postgres://fantasm:fantasm@localhost:5432/fantasm_test?sslmode=disable' go test -race ./internal/identity/...
```

## Продакшен

Образ збирається в CI (`.github/workflows/backend.yml`) під `linux/arm64` крос-компіляцією, без QEMU, і йде в ECR з незмінним тегом `sha-<commit>`. На EC2 його запускає `deploy-api` (див. [infra/terraform](../infra/terraform/README.md)); змінні оточення контейнер отримує з SSM Parameter Store (`/fantasm/<env>/...`), а не з файлу в образі.

Що має бути виставлено в проді (`refresh-env` пише це з SSM):

| Змінна | Значення в проді |
| --- | --- |
| `DATABASE_URL` | RDS з `sslmode=verify-full&sslrootcert=/etc/ssl/rds-ca.pem`, роль лише своєї бази |
| `DB_MAX_CONNS` | 8 для prod, 4 для dev (RDS `db.t4g.micro` дає ~85 з'єднань на обидва середовища) |
| `PUBLIC_URL` | `https://fantasm.naukma.com` або `https://fantasm-dev.naukma.com`: той самий хост, що в браузера, бо cookie `__Host-` і OIDC callback same-origin |
| `APP_SECRET` | ≥ 32 символи (обовʼязково при HTTPS), окремий для кожного середовища |
| `TRUSTED_PROXY_CIDRS` | мережа Docker-моста: Caddy перезаписує `X-Forwarded-For` перевіреною адресою клієнта, і API довіряє заголовку лише від цієї мережі |
| `LOG_LEVEL` | `info` |
| `RATE_LIMIT_*`, `SESSION_*_TTL`, `DB_STATEMENT_TIMEOUT`, `REQUEST_TIMEOUT`, `SHUTDOWN_TIMEOUT` | значення за замовчуванням підходять; повний перелік із межами — у `.env.example` та `internal/platform/config` |
| `MIGRATE_ON_START` | `true`: міграції застосовуються при старті; перед деплоєм `deploy-api` чекає `/healthz` і відкочується, якщо старт не вдався |

Після Caddy і CloudFront API бачить правильну адресу клієнта лише через `TRUSTED_PROXY_CIDRS`. Без нього всі запити виглядатимуть як одна адреса проксі, і ліміти по IP спрацьовуватимуть на всіх одразу.
