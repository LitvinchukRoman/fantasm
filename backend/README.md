# backend

Go-сервер Fantasm: модульний моноліт з гексагональною архітектурою. Контексти: [identity](internal/identity/README.md) (вхід лише через OIDC, сесії), [ideas](internal/ideas/README.md), [engagement](internal/engagement/README.md) (голоси, участь), [discussion](internal/discussion/README.md), [moderation](internal/moderation/README.md), [notifications](internal/notifications/README.md) та [organizations](internal/organizations/README.md). Повний контракт API — `api/swagger.yaml`.

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

`internal/app` — composition root: збирає сервіси, обробники та фонові задачі; його використовують і `cmd/api`, і інтеграційні тести (`internal/apptest`), тож тести проходять через справжній стек middleware. Контексти не імпортують адаптери один одного, окрім одного предиката видимості: `ideas/adapters/postgres.PublicVisible/Readable` — єдине місце, де записано «хто що бачить».

У `identity` інтерфейси залежностей оголошені в `service.go`, де їх використовують; окремого `ports/` немає. `adapters/oidc/` реалізує перевірку провайдерів.

## Безпека

Коротко, що саме захищає API (деталі — у коді відповідних пакетів):

- **Вхід**: лише OIDC (Google, Entra) з PKCE, `state` і `nonce`; паролів немає. Сесія — непрозорий 256-бітний токен, у базі лише SHA-256, cookie `__Host-…` (HttpOnly, Secure, SameSite=Lax) на https; ротація при вході, idle (7 діб) та абсолютний (30 діб) TTL, відкликання всіх сесій, зміна ролі скидає сесії цілі.
- **CSRF**: небезпечні методи пропускаються лише з того самого origin (`Origin` / `Sec-Fetch-Site`).
- **Ін'єкції**: увесь SQL параметризований (pgx), значення ніколи не вставляються в рядок; keyset-курсори підписані HMAC і прив'язані до списку.
- **XSS**: Markdown рендериться goldmark без сирого HTML, далі allowlist bluemonday; результат зберігається готовим. Заборонені схеми (`javascript:`, `data:`) та `http`-зображення відхиляються з 422. Усі відповіді мають `nosniff`, CSP та інші заголовки.
- **Витік існування**: прихований, видалений і неіснуючий контент відповідають однаково (404).
- **Навантаження**: ліміти на тіло запиту, таймаут, rate limit на користувача / адресу, окремі ліміти на вхід, пости й скарги; `Recover` перетворює будь-яку паніку на загальний 500 з `requestId`, не показуючи деталей.
- **Логи**: JSON (`slog`), кожен запит із `requestId`; токени, cookie та адреси клієнтів не логуються (адреса — лише keyed-хеш).
- **Цілісність**: рахунки (голоси, коментарі, учасники, карма) змінюються в тій самій транзакції, що й дія; повторні запити ідемпотентні; змагання за місця й голоси перевірено тестами з паралелізмом.

## Фонові задачі

Працюють у процесі API (`internal/platform/jobs`): `purge-expired` (сесії та спроби входу, щогодини), `purge-notifications` (прочитані > 30 діб і будь-які > 180 діб, раз на 6 годин), `rank-hot` (перерахунок hot-рейтингу, кожні 10 хв). Збій або паніка однієї задачі лише логуються.

## Перевірка

```bash
go test -race ./...
go vet ./...
```

Інтеграційні тести використовують окремі тимчасові схеми в базі, заданій через `TEST_DATABASE_URL` (старе `IDENTITY_TEST_DATABASE_URL` теж працює). Без неї вони пропускаються. Використовуй тестову базу, користувач якої може створювати й видаляти схеми.

```bash
TEST_DATABASE_URL='postgres://fantasm:fantasm@localhost:5432/fantasm_test?sslmode=disable' go test -race ./...
```

### Регресійний набір

`internal/regression` — наскрізні тести, які ганяють увесь застосунок у процесі проти справжнього Postgres (той самий стек middleware, що в проді). Вони не залежать від того, який контекст змінюється, і мають не давати зламати інваріанти. Єдина таблиця маршрутів `routes_test.go` живить кілька тестів, тож нова ручка без запису в таблиці провалює контракт-тест.

| Файл | Що перевіряє |
| --- | --- |
| `security_test.go` | доступ до кожного маршруту за рівнями (анонім / користувач / модератор / адмін); CSRF на кожному небезпечному маршруті; ворожий ввід (SQL-ін'єкції, XSS, NUL, UTF-8, величезні тіла) ніколи не дає 5xx і не розширює вибірку; текст зберігається дослівно, а в HTML-полях немає виконуваної розмітки; заголовки безпеки й єдина форма помилки (також для 404/405 роутера); приватні відповіді не кешуються; ліміти тіла й типу вмісту |
| `sessions_test.go` | cookie (HttpOnly, SameSite, розмір токена), у БД лише SHA-256 токена; повторне використання і підміна `state` (login CSRF), прострочені спроби; фіксація сесії і ротація; вихід, вихід звідусіль, відкликання чужої сесії; idle/абсолютний TTL і задача очищення; автентифікація лише cookie; зміна ролі діє одразу; редагування профілю не змінює привілейованих полів |
| `visibility_matrix_test.go` | 10 станів ідеї × 6 глядачів × усі поверхні (стрічка, sitemap, деталі, thread, participants, next, голос, участь, скарга, коментар): прихована, видалена й неіснуюча ідеї відповідають однаково, а запис без права читання не лишає слідів |
| `ratelimit_test.go` | ліміти для анонімів за адресою і для користувачів, окремі бюджети входу й записів, підроблені `X-Forwarded-For` не обходять ліміт, довірені проксі розрізняють клієнтів, 429 не доходить до обробника |
| `concurrency_test.go` | паралельні голоси, коментарі, скарги, рішення модераторів, створення ідей і перші входи лишають лічильники рівними рядкам; рівно один переможець у рішенні; квота створення точна |
| `invariants_test.go` | випадкове навантаження з кількох користувачів одночасно, потім ~17 правил цілісності БД (лічильники = рядки, один відкритий кейс на ідею, аудит рішень, без самоголосів тощо). Зерно виводиться в лог: `REGRESSION_SEED=<n>` відтворює сценарій |
| `journey_test.go` | повний життєвий цикл ідеї через усі контексти: вхід → ідея → модерація → голоси → обговорення → участь → сповіщення → автоскарги → відновлення → видалення → вихід |
| `contract_test.go` | `api/swagger.yaml` ↔ реальні маршрути в обидва боки; статуси кожної відповіді задокументовані; тіла успішних відповідей валідуються проти схем (обов'язкові поля, типи, enum, недокументовані поля) |
| `pagination_test.go` | усі списки без пропусків і повторів при будь-якому `limit` і зі збігами ключів; зміна списку під час обходу; підписані курсори прив'язані до списку й стійкі до підробки; клемпінг `limit` |
| `migrations_test.go` | нумерація і пари up/down; кожна міграція відкочується до точно тієї ж схеми й накочується знову; дані попередніх версій правильно переносяться; конвенції схеми (PK, `timestamptz`, індекси під FK, жодних токенів у відкритому вигляді) |
| `bench_test.go` | бенчмарки шляху запиту (`task bench`); не є бар'єром CI |

Поруч із контекстами лежать фазз-тести парсерів (курсор, Markdown, slug), у `internal/platform/*` — модульні тести логування, конфігурації, задач і курсорів.

```bash
task test-regression                    # лише наскрізний набір
task test-regression-repeat N=10        # повторити, щоб знайти нестабільні тести
REGRESSION_SEED=1791411867840952000 task test-regression   # відтворити випадковий сценарій
task fuzz PKG=./internal/platform/markdown TARGET=FuzzRender TIME=2m
```

У CI (`.github/workflows/build-backend.yaml`) весь набір запускається на arm64 з `-race -shuffle=on` і PostgreSQL. Фазз-тести під час звичайного `go test` перевіряють збережений корпус; довше фаззити конкретну ціль можна локально командою вище.

Лінтер і перевірка вразливостей, як у `lint-backend.yaml` та `security-backend.yaml`:

```bash
go run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.14.0 run ./...
go run golang.org/x/vuln/cmd/govulncheck@v1.8.0 ./...
```

## Продакшен

Образ збирає `.github/workflows/deploy-backend-dev.yaml` під `linux/arm64` без QEMU, сканує Grype і публікує в ECR з незмінним тегом `sha-<commit>`. На EC2 його запускає `deploy-api` (див. [infra/terraform](../infra/terraform/README.md)); змінні оточення контейнер отримує з SSM Parameter Store (`/fantasm/<env>/...`), а не з файлу в образі.

Що має бути виставлено в проді (`refresh-env` пише це з SSM):

| Змінна | Значення в проді |
| --- | --- |
| `DATABASE_URL` | RDS з `sslmode=verify-full&sslrootcert=/etc/ssl/rds-ca.pem`, роль лише своєї бази |
| `DB_MAX_CONNS` | 8 для prod, 4 для dev (RDS `db.t4g.micro` дає ~85 з'єднань на обидва середовища) |
| `PUBLIC_URL` | `https://ideas.naukma.com` або `https://fantasm-dev.naukma.com`: той самий хост, що в браузера, бо cookie `__Host-` і OIDC callback same-origin |
| `APP_SECRET` | ≥ 32 символи (обовʼязково при HTTPS), окремий для кожного середовища |
| `TRUSTED_PROXY_CIDRS` | мережа Docker-моста: Caddy перезаписує `X-Forwarded-For` перевіреною адресою клієнта, і API довіряє заголовку лише від цієї мережі |
| `LOG_LEVEL` | `info` |
| `RATE_LIMIT_*`, `SESSION_*_TTL`, `DB_STATEMENT_TIMEOUT`, `REQUEST_TIMEOUT`, `SHUTDOWN_TIMEOUT` | значення за замовчуванням підходять; повний перелік із межами — у `.env.example` та `internal/platform/config` |
| `MIGRATE_ON_START` | `true`: міграції застосовуються при старті; перед деплоєм `deploy-api` чекає `/healthz` і відкочується, якщо старт не вдався |

Після Caddy і CloudFront API бачить правильну адресу клієнта лише через `TRUSTED_PROXY_CIDRS`. Без нього всі запити виглядатимуть як одна адреса проксі, і ліміти по IP спрацьовуватимуть на всіх одразу.

## Optional monitoring

Structured JSON logging is enabled from startup. Run `bash scripts/monitoring.sh up` for Prometheus, Loki, Alloy, and a provisioned Grafana dashboard; use `bash scripts/monitoring.sh off` to return to the lightweight default. Metrics are disabled by default. Setup, log fields, retention, and verification: [monitoring/README.md](monitoring/README.md).
