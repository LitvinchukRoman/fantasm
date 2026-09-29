/**
 * Єдине джерело абсолютних URL для canonical, OG, sitemap і robots.
 * `VITE_` потрібен, бо meta() виконується і на сервері, і в браузері
 * (клієнтські переходи), а Vite вшиває в клієнт лише змінні з цим префіксом.
 */
export const SITE_URL = (import.meta.env.VITE_SITE_URL || "https://ideas.naukma.com").replace(/\/+$/, "");
export const SITE_NAME = "Fantasm";
export const SITE_LOCALE = "uk_UA";
export const SITE_LANGUAGE = "uk";
export const SITE_LOGO = "/favicon.jpg";
export const SITE_LOGO_SIZE = 564;

/**
 * Превʼю-картинки генерує scripts/gen-og.py: для кожної сторінки три пропорції
 * (Google радить 16:9, 4:3 і 1:1 для Article), ширина 1200 px.
 */
export type OgRatio = "16x9" | "4x3" | "1x1";
export const OG_SIZES: Record<OgRatio, { width: number; height: number }> = {
  "16x9": { width: 1200, height: 675 },
  "4x3": { width: 1200, height: 900 },
  "1x1": { width: 1200, height: 1200 },
};

/** `base` — шлях сторінки: "/campus/karta-kampusu" → /og/campus/karta-kampusu-16x9.jpg, "/campus" → /og/campus/index-16x9.jpg. */
export function ogBase(pagePath: string, isHub = false): string {
  const clean = normalizePath(pagePath);
  if (clean === "/") return "/og/default";
  return isHub ? `/og${clean}/index` : `/og${clean}`;
}

export function ogImage(base: string, ratio: OgRatio = "16x9") {
  return { path: `${base}-${ratio}.jpg`, ...OG_SIZES[ratio] };
}

export const DEFAULT_OG_BASE = "/og/default";

/** Шлях без кінцевого слеша (крім кореня): так віддає сервер і так посилаються сторінки. */
export function normalizePath(path: string): string {
  const clean = path.split(/[?#]/)[0] || "/";
  return clean.length > 1 ? clean.replace(/\/+$/, "") : "/";
}

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const normalized = normalizePath(path.startsWith("/") ? path : `/${path}`);
  return normalized === "/" ? `${SITE_URL}/` : `${SITE_URL}${normalized}`;
}

export type JsonLd = Record<string, unknown>;
