import type { ReactNode } from "react";
import { IconCheck, IconChevronDown, IconClose } from "~/components/landing/icons";

/**
 * Фільтри стрічки ідей. Мова та сама, що в решти інтерфейсу: пігулки з тонким бордером, акцентний
 * стан для активного значення, панелі в `--radius-card`. Компоненти без власного стану: який фільтр
 * відкрито й що вибрано, вирішує сторінка.
 */

const PILL = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap transition-colors duration-150";

export function FilterMenu({
  label,
  value,
  open,
  onToggle,
  up = false,
  children,
}: {
  label: string;
  /** Підпис вибраного значення: якщо є, фільтр підсвічений як активний. */
  value?: string;
  open: boolean;
  onToggle: () => void;
  /** Випадає вгору й вирівнюється по правому краю: для панелі в нижньому правому куті. */
  up?: boolean;
  children: ReactNode;
}) {
  const tone = open
    ? "border-[var(--color-border-strong)] bg-[var(--color-surface-strong)] text-[var(--color-text)]"
    : value
      ? "border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] text-[var(--color-text)]"
      : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]";

  return (
    <div className="relative max-sm:static max-sm:shrink-0">
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={onToggle} className={`${PILL} ${tone}`}>
        {label}
        {value ? <span className="text-[var(--color-accent)]">{value}</span> : null}
        <IconChevronDown className={`size-3.5 opacity-60 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        // Телефон: напівпрозора підкладка під шторкою, тап по ній закриває панель.
        <button
          type="button"
          aria-label="Закрити фільтр"
          tabIndex={-1}
          onClick={onToggle}
          className="fixed inset-0 z-[45] bg-black/55 sm:hidden"
        />
      )}
      {open && (
        <div
          data-curve-ignore
          className={
            (up ? "filter-panel filter-panel--up absolute right-0 bottom-full z-30 mb-3" : "filter-panel absolute top-full z-30 mt-2 sm:left-0") +
            " rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)]/95 p-1.5 shadow-[0_24px_48px_rgb(0_0_0/0.5)] backdrop-blur-xl max-sm:fixed max-sm:inset-x-3 max-sm:top-auto max-sm:bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:z-50 max-sm:mt-0 max-sm:mb-0 max-sm:max-h-[70dvh] max-sm:w-auto max-sm:overflow-y-auto sm:w-[min(19rem,calc(100vw-2.5rem))]"
          }
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Варіант одиночного вибору: назва, підказка й галочка в акценті в обраного. */
export function FilterOption({
  title,
  hint,
  selected,
  onClick,
}: {
  title: string;
  hint: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={
        "flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 " +
        (selected ? "bg-[var(--color-surface-strong)]" : "hover:bg-[var(--color-surface-strong)]/70")
      }
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium wrap-anywhere text-[var(--color-text)]">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-[var(--color-text-muted)]">{hint}</span>
      </span>
      <span
        aria-hidden="true"
        className={
          "grid size-5 shrink-0 place-items-center rounded-full transition-colors duration-150 " +
          (selected ? "bg-[var(--color-accent)] text-[var(--color-bg)]" : "border border-[var(--color-border-strong)]")
        }
      >
        {selected && <IconCheck className="size-3.5" />}
      </span>
    </button>
  );
}

/** Тег-перемикач для множинного вибору. */
export function FilterToggle({
  label,
  count,
  on,
  onClick,
}: {
  label: string;
  count: number;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors duration-150 " +
        (on
          ? "border-[var(--color-accent)]/50 bg-[var(--color-accent-soft)] text-[var(--color-text)]"
          : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]")
      }
    >
      <span className={on ? "text-[var(--color-accent)]" : "text-[var(--color-text-faint)]"}>#</span>
      {label}
      <span className="font-[family-name:var(--font-mono)] text-[0.6875rem] text-[var(--color-text-faint)] tabular-nums">{count}</span>
    </button>
  );
}

export function FilterPanelHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 pt-2 pb-1.5">
      <span className="hud-label">{title}</span>
      {action}
    </div>
  );
}

export function FilterReset({ onClick, label = "Скинути", className }: { onClick: () => void; label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-sm text-[var(--color-text-faint)] transition-colors duration-150 hover:text-[var(--color-text)] ${className ?? ""}`}
    >
      <IconClose className="size-3.5" />
      {label}
    </button>
  );
}
