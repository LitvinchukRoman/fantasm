import { createContext, useContext } from "react";
import { supportOrigin } from "~/lib/support/client";

/**
 * Content-Security-Policy сторінок. Ставить її Node (entry.server), а не CloudFront:
 * у кожній SSR-відповіді свої інлайн-скрипти гідрації, тож дозволити їх можна лише
 * nonce на запит. CloudFront зберігає цей заголовок і додає суворий запасний лише
 * відповідям без власного (infra/terraform/edge/cloudfront.tf).
 *
 * - style-src з 'unsafe-inline': React рендерить атрибути style, а їх nonce не покриває.
 * - img-src https:: опис ідеї дозволяє HTTPS-картинки з будь-якого сайту (markdown.Idea).
 * - worker-src 'self': service worker сповіщень лежить на цьому ж хості (/sw.js).
 * - Google-хости взяті з рекомендованої Google CSP для GA4.
 * - connect-src + origin бота підтримки, лише якщо VITE_SUPPORT_API вказує на інший хост.
 */
export function contentSecurityPolicy(nonce: string, support: string | null = supportOrigin()): string {
  const connect = ["'self'", ...(support ? [support] : []), "https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com"];
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://*.googletagmanager.com`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob: https:",
    `connect-src ${connect.join(" ")}`,
    "worker-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Nonce поточного SSR-запиту. У браузері порожній: атрибут nonce уже виконаним скриптам не потрібен. */
export const NonceContext = createContext<string | undefined>(undefined);

export const useNonce = () => useContext(NonceContext);
