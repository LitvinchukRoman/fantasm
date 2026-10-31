/**
 * Хто пише в підтримку. Бот — окремий сервер без доступу до cookie сесії, тож віджет бере у
 * fantasm короткий підписаний токен (`POST /api/me/support-token`, 15 хв) і передає його з
 * кожним повідомленням. Бот звертається з ним до `/api/integrations/support/*` і діє лише від
 * імені цієї людини. Анонім токена не має: бот відповідає, але підписками керувати не може.
 */
export const IDENTITY_HEADER = "X-Fantasm-Identity";

/** Беремо новий токен заздалегідь, щоб він не сплив, поки бот ще обробляє повідомлення. */
const REFRESH_MARGIN_MS = 3 * 60_000;

interface Cached {
  userId: string;
  token: string;
  expiresAt: number;
}

let cached: Cached | null = null;
let pending: { userId: string; token: Promise<string | null> } | null = null;

async function issue(userId: string): Promise<string | null> {
  try {
    const response = await fetch("/api/me/support-token", {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { token?: unknown; expiresAt?: unknown };
    if (typeof body.token !== "string" || typeof body.expiresAt !== "string") return null;
    const expiresAt = Date.parse(body.expiresAt);
    if (!Number.isFinite(expiresAt)) return null;
    cached = { userId, token: body.token, expiresAt };
    return body.token;
  } catch {
    return null;
  }
}

/**
 * Токен користувача `userId` або null (анонім, бекенд без білінгу, мережа). Відсутній токен не
 * блокує чат: повідомлення піде без нього. Кеш привʼязаний до користувача, бо вихід і вхід під
 * іншим акаунтом відбуваються без перезавантаження сторінки.
 */
export function supportIdentity(userId: string | null | undefined, now: () => number = Date.now): Promise<string | null> {
  if (!userId) return Promise.resolve(null);
  if (cached?.userId === userId && cached.expiresAt - REFRESH_MARGIN_MS > now()) return Promise.resolve(cached.token);
  if (pending?.userId !== userId) {
    const request = { userId, token: issue(userId) };
    pending = request;
    void request.token.finally(() => {
      if (pending === request) pending = null;
    });
  }
  return pending.token;
}

/** Лише для тестів. */
export function resetSupportIdentity() {
  cached = null;
  pending = null;
}
