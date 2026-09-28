# backend

Go-сервер Fantasm: модульний моноліт з гексагональною архітектурою. Перший реалізований контекст — [identity](internal/identity/README.md): вхід через Google/Entra, афіліація, сесії та поточний користувач. Інші контексти поки лишаються каркасом.

Правила продукту — у `../FULL_CONTEXT.md`.

## Запуск

Потрібні [Task](https://taskfile.dev) і [golang-migrate CLI](https://github.com/golang-migrate/migrate).

```bash
cp .env.example .env
task db-up
task migrate-up
task run
```

`task migrate-down` відкочує одну міграцію, `task migrate-new -- <назва>` створює нову. `MIGRATE_ON_START=true` застосовує міграції на старті сервера.

Для входу заповни параметри провайдерів у `.env` за [інструкцією identity](internal/identity/README.md). Без налаштованих провайдерів сервер запускається, але маршрути входу повертають 404.

## Структура

```
cmd/api/           точка входу
migrations/        golang-migrate
internal/platform/ apperr, config, postgres, migrate
internal/<ctx>/    identity, ideas, engagement, discussion, moderation, notifications
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
