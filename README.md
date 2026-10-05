# Fantasm

Платформа ідей спільноти НаУКМА: від стартапів і волонтерства до книжкових клубів. Могилянці позначені окремо і мають перевагу в спільноті. Під ідеєю — обговорення.

Повний інтент, правила і те, що свідомо не переносимо з MVP, — у [FULL_CONTEXT.md](FULL_CONTEXT.md). Прочитай його перед першим змістовним кодом.

| Каталог | Що це |
| --- | --- |
| `frontend/` | новий клієнт, React + TypeScript |
| `backend/` | новий сервер, Go |
| `legacy/` | заморожений фронтенд MVP (Next.js). Не розвивати |
| `infra/` | статика фронтенду: S3 + CloudFront. Бекенд на EC2 ще попереду |

## Гілки

Ім'я гілки: `тип/короткий-опис`. Тип один із `feat`, `fix`, `chore`, `infra`, `docs`. Далі лише малі латинські літери, цифри і дефіси. Приклади: `feat/forum-thread`, `fix/ci-annotations`, `infra/frontend-static`.

`main` і гілки Dependabot (`dependabot/...`) цим правилом не обмежені. Перевіряє джоб `branch-name` у `.github/workflows/ci.yml`; без нього pull request у `main` не мерджиться. Окремий ruleset GitHub на ім'я гілки на персональному акаунті недоступний.

## Локально

Термінал 1:

```bash
cd backend
go run ./cmd/api
```

Сервер слухає `:8080`. Перевірка: `curl -s localhost:8080/healthz`.

Термінал 2:

```bash
cd frontend
npm install
npm run dev
```

Клієнт — [http://localhost:5173](http://localhost:5173). Запити на `/api` проксуються на Go.
