import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconCalendar, IconChevronDown } from "~/components/landing/icons";
import {
  MINUTE_STEP,
  composeWhen,
  formatPickedWhen,
  keepAhead,
  monthGrid,
  monthTitle,
  padTime,
  parseWhen,
  shiftMonth,
  startOfDay,
  weekdayLabels,
  type WhenParts,
} from "~/lib/when";

type Spot = { top: number; left: number; sheet: boolean };

/**
 * День і час у стилі сайту. Нативний datetime-local лишає системний календар
 * (сині клітинки, англійські Clear/Today) і плейсхолдер dd.mm.yyyy.
 */
export function WhenPicker({
  id,
  value,
  invalid,
  onChange,
}: {
  id: string;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState<Spot | null>(null);
  const parsed = parseWhen(value);
  const [cursor, setCursor] = useState(() => {
    const current = parseWhen(value);
    if (current) return { year: current.year, month: current.month };
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [hour, setHour] = useState(parsed?.hour ?? 18);
  const [minute, setMinute] = useState(parsed ? snapMinute(parsed.minute) : 0);
  const [todayStamp] = useState(() => {
    const now = new Date();
    return startOfDay(now.getFullYear(), now.getMonth(), now.getDate());
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const openPanel = () => {
    const current = parseWhen(value);
    const base = current ? new Date(current.year, current.month, 1) : new Date();
    setCursor({ year: base.getFullYear(), month: base.getMonth() });
    setHour(current?.hour ?? 18);
    setMinute(current ? snapMinute(current.minute) : 0);
    setSpot(measure(triggerRef.current));
    setOpen(true);
  };

  const apply = (parts: WhenParts) => {
    const ahead = keepAhead(parts);
    setHour(ahead.hour);
    setMinute(ahead.minute);
    onChange(composeWhen(ahead));
  };

  const shiftTime = (kind: "hour" | "minute", direction: -1 | 1) => {
    const nextHour = kind === "hour" ? (hour + direction + 24) % 24 : hour;
    const marks = [0, 15, 30, 45];
    const index = Math.max(0, marks.indexOf(minute));
    const nextMinute = kind === "minute" ? marks[(index + direction + marks.length) % marks.length] : minute;
    setHour(nextHour);
    setMinute(nextMinute);
    if (parsed) apply({ ...parsed, hour: nextHour, minute: nextMinute });
  };

  const cells = monthGrid(cursor.year, cursor.month);
  const label = parsed ? formatPickedWhen(value) : "День і час";

  const panel = spot && (
    <div className={spot.sheet ? "fixed inset-0 z-50 flex items-end p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" : "fixed inset-0 z-50"}>
      <button type="button" aria-label="Закрити календар" className={`absolute inset-0 ${spot.sheet ? "bg-black/55" : ""}`} onClick={() => setOpen(false)} />
      <div
        id={panelId}
        role="dialog"
        aria-label="Коли відбудеться"
        style={spot.sheet ? undefined : { top: spot.top, left: spot.left }}
        className={
          spot.sheet
            ? "relative z-10 max-h-[min(32rem,calc(100dvh-1.5rem))] w-full overflow-y-auto rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4 shadow-[0_24px_48px_rgb(0_0_0/0.5)]"
            : "absolute z-10 w-[19rem] rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4 shadow-[0_24px_48px_rgb(0_0_0/0.5)]"
        }
      >
        <div className="flex items-center justify-between gap-2">
          <button type="button" aria-label="Попередній місяць" onClick={() => setCursor((current) => shiftMonth(current, -1))} className="grid size-8 place-items-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-strong)] hover:text-[var(--color-text)]">
            <IconChevronDown className="size-4 rotate-90" />
          </button>
          <p className="text-sm font-medium text-[var(--color-text)]">{monthTitle(cursor.year, cursor.month)}</p>
          <button type="button" aria-label="Наступний місяць" onClick={() => setCursor((current) => shiftMonth(current, 1))} className="grid size-8 place-items-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-strong)] hover:text-[var(--color-text)]">
            <IconChevronDown className="size-4 -rotate-90" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1 text-center">
          {weekdayLabels().map((day) => (
            <span key={day} className="py-1 text-[11px] font-medium text-[var(--color-text-faint)]">{day}</span>
          ))}
          {cells.map((day, index) => {
            if (day === null) return <span key={`empty-${index}`} />;
            const stamp = startOfDay(cursor.year, cursor.month, day);
            const past = stamp < todayStamp;
            const selected = parsed?.year === cursor.year && parsed.month === cursor.month && parsed.day === day;
            const isToday = stamp === todayStamp;
            return (
              <button
                key={day}
                type="button"
                disabled={past}
                aria-pressed={selected}
                onClick={() => apply({ year: cursor.year, month: cursor.month, day, hour, minute })}
                className={`mx-auto grid size-9 place-items-center rounded-full text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
                  selected
                    ? "bg-[var(--color-accent)] font-medium text-[var(--color-bg)]"
                    : past
                      ? "cursor-default text-[var(--color-text-faint)]/40"
                      : `text-[var(--color-text)] hover:bg-[var(--color-surface-strong)] ${isToday ? "ring-1 ring-[var(--color-accent)]" : ""}`
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
          <span className="text-sm text-[var(--color-text-muted)]">Час</span>
          <div className="flex items-center gap-2">
            <Stepper label="Години" value={padTime(hour)} onStep={(direction) => shiftTime("hour", direction)} />
            <span className="text-[var(--color-text-faint)]" aria-hidden="true">:</span>
            <Stepper label="Хвилини" value={padTime(minute)} onStep={(direction) => shiftTime("minute", direction)} />
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-[var(--color-bg)]">
            Готово
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? setOpen(false) : openPanel())}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border ${invalid ? "border-red-500" : "border-[var(--color-border)]"} bg-[var(--color-bg)] px-3 py-2 text-left text-[16px] sm:text-sm transition-[border-color,box-shadow] duration-200 hover:border-[var(--color-accent)] hover:shadow-[0_0_12px_rgb(255_99_99/0.3)] focus-visible:border-[var(--color-accent)] focus-visible:outline-none`}
      >
        <span className={parsed ? "text-[var(--color-text)]" : "text-[var(--color-text-faint)]"}>{label}</span>
        <IconCalendar className="size-4 shrink-0 text-[var(--color-text-muted)]" />
      </button>
      {open && spot && createPortal(panel, document.body)}
    </>
  );
}

function snapMinute(minute: number): number {
  return Math.round(minute / MINUTE_STEP) * MINUTE_STEP % 60;
}

function measure(trigger: HTMLButtonElement | null): Spot {
  const sheet = window.matchMedia("(max-width: 639px)").matches;
  if (!trigger || sheet) return { top: 0, left: 0, sheet };
  const rect = trigger.getBoundingClientRect();
  const width = 304;
  const height = 440;
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
  const below = rect.bottom + 8;
  const top = below + height > window.innerHeight - 12 && rect.top > height ? rect.top - height - 8 : below;
  return { top, left, sheet: false };
}

function Stepper({ label, value, onStep }: { label: string; value: string; onStep: (direction: -1 | 1) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-1 py-0.5">
      <button type="button" aria-label={`${label}, менше`} onClick={() => onStep(-1)} className="grid size-6 place-items-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-strong)] hover:text-[var(--color-text)]">
        <IconChevronDown className="size-3.5 rotate-90" />
      </button>
      <span className="w-7 text-center text-sm tabular-nums text-[var(--color-text)]">{value}</span>
      <button type="button" aria-label={`${label}, більше`} onClick={() => onStep(1)} className="grid size-6 place-items-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-strong)] hover:text-[var(--color-text)]">
        <IconChevronDown className="size-3.5 -rotate-90" />
      </button>
    </span>
  );
}
