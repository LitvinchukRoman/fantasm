import type { ReactNode } from "react";

export type MetaItem = { label: string; value: ReactNode };

/**
 * Сітка «ключ / значення» з тонкими лініями, як PROJECT_TYPE / ENTRY_YEAR на референсі.
 * Рядок, значення якого порожнє, не показуємо: не вигадуємо дані.
 */
export function MetaGrid({ items, className }: { items: MetaItem[]; className?: string }) {
  const rows = items.filter((item) => item.value !== null && item.value !== undefined && item.value !== "");
  if (rows.length === 0) return null;
  return (
    <dl className={["border-t border-[var(--color-border)]", className].filter(Boolean).join(" ")}>
      {rows.map((item) => (
        <div
          key={item.label}
          className="grid grid-cols-[minmax(6rem,9rem)_1fr] items-baseline gap-4 border-b border-[var(--color-border)] py-3"
        >
          <dt className="hud-label">{item.label}</dt>
          <dd className="min-w-0 text-sm text-[var(--color-text)] [overflow-wrap:anywhere]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
