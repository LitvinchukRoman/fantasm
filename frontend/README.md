# frontend

Новий клієнт Fantasm: React + TypeScript, React Router v7 (framework mode,
Vite під капотом). Публічні сторінки рендеряться сервером і пререндеряться
в статичний HTML на білді (SSG) — вимога з `../FULL_CONTEXT.md`, розділ
«Висновок по архітектурі», не оптимізація.

Лендинг (`/`) уже має дизайн: тема за мотивами raycast.com / linear.app /
reflect.app, розділ «Могилянська перевага» використовує чекліст-паттерн
clerk.com, фон hero — перенесений вербатим шар зі www.shopify.com/editions.
Решта екранів (стрічка, ідея, форум, кабінет) ще не зроблені.

Mobile PageSpeed тримається на рівні ~90 завдяки кільком правилам: WebGL-фони стартують лише на GPU
після завантаження, перший екран повністю є в SSR-HTML, шрифти свої. Перед зміною першого екрана,
шрифтів, фонів чи `root.tsx` прочитай [PERFORMANCE.md](PERFORMANCE.md).

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
| `VITE_SUPPORT_API` | білд | API бота підтримки, типово `/api/support` (той самий origin). Абсолютна адреса (`https://support.example.com/api/support`) сама додається в CSP `connect-src`, а запити йдуть з `credentials: "include"`: бот має відповідати CORS із цим origin і дозволяти заголовок `X-Fantasm-Identity` |
| `VITE_SUPPORT_MOCK` | білд | `true` — сценарії чату без бекенду бота (`app/lib/support/mock.ts`), зокрема підписки |

Плани й спонсорство (`/pricing`, розділ «Підписка» в `/settings`, «Спонсорство» на сторінці ідеї) беруть усе з
`/api/billing/*` і `/api/me/billing`. Якщо бекенд без білінгу, ці блоки просто не показуються.

Бот підтримки не бачить cookie сесії. Віджет бере у fantasm короткий токен (`POST /api/me/support-token`, 15 хв)
і шле його з кожним повідомленням у заголовку `X-Fantasm-Identity`. Бот передає його назад у
`/api/integrations/support/*` (`X-Fantasm-Support-User`) разом зі своїм `SUPPORT_API_TOKEN`; деталі —
`backend/internal/billing/README.md`.

URL сайту без кінцевого слеша: `server.js` віддає `/ideas` з
`build/client/ideas/index.html` і редіректить `/ideas/` → `/ideas` (301).
Canonical, sitemap і внутрішні посилання використовують ту саму форму.
