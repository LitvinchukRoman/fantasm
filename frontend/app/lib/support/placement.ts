/** Де кнопка «Допомога» не потрібна: адмінка має консоль, на /help чат уже на сторінці. */
export function launcherHidden(pathname: string): boolean {
  return (
    pathname === "/help" ||
    pathname === "/moderation" ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/welcome"
  );
}

/** Сторінка ідеї: чат одразу знає, про яку ідею питають. Бекенд сам перевірить, що вона твоя. */
export function ideaSlugFrom(pathname: string): string | undefined {
  const slug = /^\/ideas\/([^/]+)\/?$/.exec(pathname)?.[1];
  return slug && slug !== "new" ? decodeURIComponent(slug) : undefined;
}

/** Ширина бічної панелі чату в px: типова, вужчої не буває, розгорнута. */
export const PANEL_WIDTH = { min: 400, default: 480, wide: 880 } as const;

/** Панель не ширша за екран мінус поля (24 px з боків) і не вужча за мінімум. */
export function clampPanelWidth(width: number, viewport: number): number {
  const max = Math.max(PANEL_WIDTH.min, viewport - 48);
  return Math.round(Math.min(Math.max(width, PANEL_WIDTH.min), max));
}

/** Розгорнута — це помітно ширша за типову; кнопка в шапці перемикає між двома станами. */
export function isWide(width: number): boolean {
  return width >= (PANEL_WIDTH.default + PANEL_WIDTH.wide) / 2;
}
