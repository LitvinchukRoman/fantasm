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
npm run build          # SSR-бандл + пререндер публічних сторінок у build/client
npm run build:preview  # те саме, але з тестовими картками ідей (noindex)
npm run start          # server.js: пререндерений HTML + SSR для решти
npm run typecheck
npm run lint
```

Змінні оточення:

| Змінна | Де читається | Навіщо |
|---|---|---|
| `VITE_SITE_URL` | білд (вшивається в клієнт) | абсолютні URL у canonical, OG, sitemap, robots. Типово `https://ideas.naukma.com` |
| `IDEAS_SEED` | білд і сервер | `true` вмикає тестові картки (`anomalija-bunt`, `zrazok-*`). Без змінної вони є лише в `npm run dev` |
| `PORT`, `HOST` | `server.js` | адреса прод-сервера, типово `:3000` |

URL сайту без кінцевого слеша: `server.js` віддає `/ideas` з
`build/client/ideas/index.html` і редіректить `/ideas/` → `/ideas` (301).
Canonical, sitemap і внутрішні посилання використовують ту саму форму.
