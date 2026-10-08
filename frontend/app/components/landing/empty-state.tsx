import type { ComponentType } from "react";
import { Link } from "react-router";
import type { IconProps } from "./icons";

/**
 * Порожній стан секції, коли стрічка чи події порожні. Текст title/body/
 * action узятий з порожнього стану MVP (hot-feed і події), а не вигаданий.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  actionHref,
  actionLabel,
}: {
  icon: ComponentType<IconProps>;
  title: string;
  body: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-[var(--color-border-strong)] px-6 py-14 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
        <Icon className="size-6" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-[var(--color-text)]">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-[var(--color-text-muted)]">{body}</p>
      <Link
        to={actionHref}
        prefetch="intent"
        className="mt-6 inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition-all duration-150 hover:bg-[var(--color-surface-strong)] hover:scale-105"
      >
        {actionLabel}
      </Link>
    </div>
  );
}
