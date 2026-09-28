# backend

Go-сервер Fantasm: гексагональна архітектура з bounded contexts (DDD). Зараз це порожній каркас: контексти без логіки, сервер віддає лише `GET /healthz`.

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
