import type { ReactNode } from "react";

/**
 * Заголовок розділу в регістрі «Сигнал»: `01 // ЗМІСТ`. Це справжній h2 для навігації
 * екранними читалками й SEO, оформлений як моно-підпис.
 */
export function SectionLabel({ index, id, children }: { index: string; id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="hud-label scroll-mt-28 flex items-center gap-3 !text-[var(--color-text-muted)]">
      <span className="tabular-nums text-[var(--color-accent)]">{index}</span>
      <span aria-hidden="true">//</span>
      <span>{children}</span>
    </h2>
  );
}
