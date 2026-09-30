# backend

Go-сервер Fantasm: модульний моноліт з гексагональною архітектурою. Перший реалізований контекст — [identity](internal/identity/README.md): вхід через Google/Microsoft, сесії та поточний користувач. Інші контексти поки лишаються каркасом.

Правила продукту — у `../FULL_CONTEXT.md`.

## Запуск

```bash
cp .env.example .env
docker compose up -d --build
```

Compose запускає PostgreSQL і API на `http://localhost:8080`, чекає готовності бази та застосовує міграції. Перед запуском заповни `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` та/або `ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET` у `.env`. Без параметрів провайдер вимкнений: його маршрут входу повертає 404. Прив’язки до університету немає; об’єднання акаунтів Google і Microsoft відкладене.

Для frontend development `.env.example` задає `PUBLIC_URL=http://localhost:5173`. Зареєструй callback URL `http://localhost:5173/api/auth/google/callback` та/або `http://localhost:5173/api/auth/entra/callback`, запусти `npm run dev` у `frontend` і починай вхід через `http://localhost:5173/api/auth/google/login` або `/api/auth/entra/login`. Vite вже проксіює `/api` на backend. Кнопки frontend підключені до цих маршрутів; сторінка входу показує увімкнених провайдерів, поточного користувача та його організаційні бейджі. Для прямого використання API зміни `PUBLIC_URL` на `http://localhost:8080` і відповідно онови callback URL.

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
