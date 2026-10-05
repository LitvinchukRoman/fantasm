import type { ReactNode } from "react";

type Tone = "default" | "strong" | "accent";

const TONES: Record<Tone, string> = {
  default: "border-[var(--color-border-strong)] text-[var(--color-text-muted)]",
  strong: "border-white/30 text-[var(--color-text)]",
  accent: "border-[var(--color-accent)]/40 text-[var(--color-accent)]",
};

/**
 * Тег, категорія, кампус, роль. Не кнопка: для натискань є Button.
 * Мова та сама, що в .idea-tag стрічки: 6px, моно 11px, великі літери.
 */
export function Chip({ tone = "default", title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-[var(--radius-chip)] border px-2 py-1 font-[family-name:var(--font-mono)] text-[0.6875rem] leading-4 tracking-[0.04em] whitespace-nowrap uppercase ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
