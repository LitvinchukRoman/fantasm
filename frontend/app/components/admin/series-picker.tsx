import { useEffect, useId, useRef, useState } from "react";
import { IconChevronDown } from "~/components/landing/icons";

type Option = { name: string; color: string };

/** Розгортний список із галочками: кілька параметрів одразу, «усі» одним кліком. */
export function SeriesPicker({
  options,
  selected,
  onChange,
}: {
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useId();
  const all = selected.length === options.length;

  useEffect(() => {
    if (!open) return;
    function away(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  function toggle(name: string) {
    onChange(selected.includes(name) ? selected.filter((item) => item !== name) : options.map((item) => item.name).filter((item) => item === name || selected.includes(item)));
  }

  const summary = all ? "Усі параметри" : selected.length === 0 ? "Нічого не вибрано" : selected.length === 1 ? selected[0] : `${selected.length} з ${options.length}`;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-w-48 items-center justify-between gap-3 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg)] py-2 pr-3.5 pl-4 text-sm transition-[border-color,transform] duration-150 ease-[var(--ease-out-expo)] hover:border-[var(--color-text-faint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] active:scale-[0.98]"
      >
        <span className="flex items-center gap-2">
          <span className="flex -space-x-1" aria-hidden="true">
            {options.filter((item) => selected.includes(item.name)).slice(0, 4).map((item) => (
              <span key={item.name} className="size-2.5 rounded-full ring-2 ring-[var(--color-bg)]" style={{ background: item.color }} />
            ))}
          </span>
          {summary}
        </span>
        <IconChevronDown className={"size-4 text-[var(--color-text-faint)] transition-transform duration-200 ease-[var(--ease-out-expo)] " + (open ? "rotate-180" : "")} />
      </button>
      {open && (
        <div
          id={panel}
          className="admin-pop absolute top-[calc(100%+0.5rem)] left-0 z-30 w-64 rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface-strong)] p-1.5 shadow-[0_20px_50px_rgb(0_0_0/0.45)]"
        >
          <fieldset>
            <legend className="sr-only">Параметри графіка</legend>
            <Row label={`Усі (${options.length})`} checked={all} onChange={() => onChange(all ? [] : options.map((item) => item.name))} />
            <div className="my-1 h-px bg-[var(--color-border)]" />
            {options.map((item) => (
              <Row key={item.name} label={item.name} color={item.color} checked={selected.includes(item.name)} onChange={() => toggle(item.name)} />
            ))}
          </fieldset>
        </div>
      )}
    </div>
  );
}

function Row({ label, color, checked, onChange }: { label: string; color?: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-[12px] px-3 py-2 text-sm text-[var(--color-text)] transition-colors duration-150 hover:bg-[rgb(255_255_255/0.05)]">
      <input type="checkbox" checked={checked} onChange={onChange} className="size-4 accent-[var(--color-accent)]" />
      <span className="flex-1">{label}</span>
      {color && <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: color }} />}
    </label>
  );
}
