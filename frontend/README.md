# frontend

Новий клієнт Fantasm: React + TypeScript, React Router v7 (framework mode,
Vite під капотом). Публічні сторінки рендеряться сервером і пререндеряться
в статичний HTML на білді (SSG) — вимога з `../FULL_CONTEXT.md`, розділ
«Висновок по архітектурі», не оптимізація.

Лендинг (`/`) уже має дизайн: тема за мотивами raycast.com / linear.app /
reflect.app, розділ «Могилянська перевага» використовує чекліст-паттерн
clerk.com, фон hero — перенесений вербатим шар зі www.shopify.com/editions.
Решта екранів (стрічка, ідея, форум, кабінет) ще не зроблені.

```bash
npm install
npm run dev
```

Dev-сервер проксує `/api` і `/healthz` на `http://localhost:8080`.

```bash
npm run build   # SSR-бандл + пререндер "/" у build/client
npm run start   # запустити зібраний SSR-сервер
npm run typecheck
npm run lint
```
