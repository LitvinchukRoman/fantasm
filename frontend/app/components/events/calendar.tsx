import { useEffect, useId, useRef, useState } from "react";
import { IconArrowRight } from "~/components/landing/icons";

/**
 * Календар місяця для /events. Працює зі «днями-ключами» "YYYY-MM-DD" (київська доба),
 * тож без Date у локальному поясі: сітка рахується в UTC і однакова на сервері й у браузері.
 */

export type DayRange = { from: string; to: string };

const pad = (value: number) => String(value).padStart(2, "0");
export const dayKey = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;

const monthTitle = new Intl.DateTimeFormat("uk-UA", { month: "long", year: "numeric", timeZone: "UTC" });

/** "жовтень 2026" без суфікса «р.», який додає uk-UA. */
function formatMonth(date: Date): string {
  return monthTitle
    .formatToParts(date)
    .filter((part) => part.type === "month" || part.type === "year")
    .map((part) => part.value)
    .join(" ");
}
const dayLong = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", timeZone: "UTC" });
const weekdayShort = new Intl.DateTimeFormat("uk-UA", { weekday: "short", timeZone: "UTC" });

function fromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDay(key: string): string {
  return dayLong.format(fromKey(key));
}

export function formatRange(range: DayRange): string {
  return range.from === range.to ? formatDay(range.from) : `${formatDay(range.from)} – ${formatDay(range.to)}`;
}

/** Клік по дню: перший клік обирає день, другий на інший день робить проміжок, повторний клік по єдиному дню знімає вибір. */
export function nextRange(current: DayRange | null, key: string): DayRange | null {
  if (!current || current.from !== current.to) return { from: key, to: key };
  if (current.from === key) return null;
  return key < current.from ? { from: key, to: current.from } : { from: current.from, to: key };
}

const WEEKDAYS = Array.from({ length: 7 }, (_, index) => weekdayShort.format(new Date(Date.UTC(2026, 0, 5 + index))));

function shiftMonth(month: string, delta: number): string {
  const [year, value] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, value - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}`;
}

/** Висота рядка = діаметр кружечка кінців: контур і кружечок збігаються по дузі без щілин. */
const ROW = 40;
const RADIUS = ROW / 2;
/** Радіус заокруглення там, де проміжок впирається в край сітки (перенос на інший тиждень). */
const CORNER = 10;

/**
 * Контур проміжку як SVG-path, обхід за годинниковою стрілкою.
 *
 * Кінці, це півкола радіуса RADIUS по кружечках кінцевих днів. Краї сітки й «сходинка» між
 * тижнями, це прямі з заокругленням CORNER. Кутові випадки (кружечок стоїть у кутку смуги):
 *  - перший день у пн (лівий верх): ліва пряма йде вниз від крайньої лівої точки кола, верх
 *    іде від верхньої точки кола, тож кут смуги ховається за колом і обидві сторони облягають його;
 *  - перший день у нд (правий верх): те саме праворуч;
 *  - останній день у пн (лівий низ) або в нд (правий низ): нижня дуга кола плавно переходить у
 *    бічну пряму без прямокутного «відкусування».
 * Смуга вужча за сітку на L з кожного боку, щоб її краї торкалися кіл у першій і сьомій колонках.
 */
function contourPaths(startIdx: number, endIdx: number, width: number): string[] {
  const cw = width / 7;
  const inset = (cw - ROW) / 2;
  const left = inset;
  const right = width - inset;
  const r0 = Math.floor(startIdx / 7);
  const r1 = Math.floor(endIdx / 7);
  const startCol = startIdx % 7;
  const endCol = endIdx % 7;
  const x0 = (startCol + 0.5) * cw;
  const x1 = (endCol + 0.5) * cw;
  const R = RADIUS;
  const cr = CORNER;
  const row = (index: number) => index * ROW;
  const arc = (x: number, y: number) => `A${R} ${R} 0 0 1 ${x} ${y}`;

  // Один тиждень: капсула між двома кружечками.
  if (r0 === r1) {
    const y = row(r0);
    return [`M${x0} ${y}L${x1} ${y}${arc(x1, y + ROW)}L${x0} ${y + ROW}${arc(x0, y)}Z`];
  }

  // Сусідні тижні без спільної зони по горизонталі: дві окремі фігури.
  if (r1 === r0 + 1 && endCol <= startCol) {
    const ya = row(r0);
    const yb = row(r1);
    const first =
      startCol === 6
        ? `M${x0} ${ya}${arc(right, ya + R)}${arc(x0, ya + ROW)}${arc(x0, ya)}Z`
        : `M${x0} ${ya}L${right - cr} ${ya}Q${right} ${ya} ${right} ${ya + cr}L${right} ${ya + ROW - cr}Q${right} ${ya + ROW} ${right - cr} ${ya + ROW}L${x0} ${ya + ROW}${arc(x0, ya)}Z`;
    const second =
      endCol === 0
        ? `M${x1} ${yb}${arc(x1, yb + ROW)}${arc(x1, yb)}Z`
        : `M${left + cr} ${yb}L${x1} ${yb}${arc(x1, yb + ROW)}L${left + cr} ${yb + ROW}Q${left} ${yb + ROW} ${left} ${yb + ROW - cr}L${left} ${yb + cr}Q${left} ${yb} ${left + cr} ${yb}Z`;
    return [first, second];
  }

  // Кілька тижнів: одна фігура зі сходинкою.
  const yStart = row(r0);
  const yStepLeft = row(r0 + 1);
  const yStepRight = row(r1);
  const yBottom = row(r1 + 1);
  const d: string[] = [`M${x0} ${yStart}`];

  // Правий верх і права сторона.
  if (startCol === 6) d.push(arc(right, yStart + R));
  else d.push(`L${right - cr} ${yStart}Q${right} ${yStart} ${right} ${yStart + cr}`);
  if (endCol === 6) {
    d.push(`L${right} ${yBottom - R}${arc(x1, yBottom)}`);
  } else {
    d.push(`L${right} ${yStepRight - cr}Q${right} ${yStepRight} ${right - cr} ${yStepRight}`);
    d.push(`L${x1} ${yStepRight}${arc(x1, yBottom)}`);
  }

  // Лівий низ.
  if (endCol === 0) d.push(arc(left, yBottom - R));
  else d.push(`L${left + cr} ${yBottom}Q${left} ${yBottom} ${left} ${yBottom - cr}`);

  // Ліва сторона й лівий верх.
  if (startCol === 0) {
    d.push(`L${left} ${yStart + R}${arc(x0, yStart)}Z`);
  } else {
    d.push(`L${left} ${yStepLeft + cr}Q${left} ${yStepLeft} ${left + cr} ${yStepLeft}`);
    d.push(`L${x0} ${yStepLeft}${arc(x0, yStart)}Z`);
  }
  return [d.join("")];
}

/**
 * Проміжок як одна фігура з контуром (як діапазон дат в AWS): світла заливка й тонка обводка
 * повторюють форму вибраних клітинок по всіх тижнях. Розкриття йде від першого обраного дня:
 * clipPath з прямокутником на кожен тиждень, ширину яких веде requestAnimationFrame.
 */
function RangeContour({
  width,
  rows,
  startIdx,
  endIdx,
  animation,
}: {
  width: number;
  rows: number;
  startIdx: number;
  endIdx: number;
  /** Не null: розкриття від `fromLeft` краю; тривалість у мс. */
  animation: { fromLeft: boolean; duration: number } | null;
}) {
  const clipId = useId().replace(/:/g, "");
  const [progress, setProgress] = useState(animation ? 0 : 1);

  const animated = animation !== null;
  const animationMs = animation?.duration ?? 0;
  useEffect(() => {
    if (!animated) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduce ? 1 : animationMs;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const value = Math.min(1, (now - start) / duration);
      setProgress(value);
      if (value < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animated, animationMs]);

  const cw = width / 7;
  const paths = contourPaths(startIdx, endIdx, width);
  const p = animation ? progress : 1;

  const r0 = Math.floor(startIdx / 7);
  const r1 = Math.floor(endIdx / 7);
  const c0 = startIdx % 7;
  const c1 = (endIdx % 7) + 1;
  const rowsInfo = [];
  for (let row = r0; row <= r1; row++) {
    const left = row === r0 ? (c0 + 0.5) * cw - RADIUS : 0;
    const right = row === r1 ? (c1 - 0.5) * cw + RADIUS : width;
    rowsInfo.push({ row, left, right });
  }
  const order = animation && !animation.fromLeft ? [...rowsInfo].reverse() : rowsInfo;
  const total = rowsInfo.reduce((sum, info) => sum + (info.right - info.left), 0);
  const revealed = p * total;
  const clips: { x: number; y: number; w: number; h: number }[] = [];
  let before = 0;
  for (const info of order) {
    const rowWidth = info.right - info.left;
    const frac = Math.max(0, Math.min(1, (revealed - before) / rowWidth));
    before += rowWidth;
    if (frac <= 0) continue;
    const full = frac >= 1;
    const w = frac * rowWidth + (full ? 6 : 3);
    const x = animation && !animation.fromLeft ? info.right + 3 - w : info.left - 3;
    clips.push({ x, y: info.row * ROW - 2, w, h: ROW + 4 });
  }

  return (
    <svg
      aria-hidden="true"
      width={width}
      height={rows * ROW}
      viewBox={`0 0 ${width} ${rows * ROW}`}
      className="pointer-events-none absolute top-0 left-0 z-0 overflow-visible"
    >
      <defs>
        <clipPath id={clipId}>
          {clips.map((clip, index) => (
            <rect key={index} x={clip.x} y={clip.y} width={clip.w} height={clip.h} />
          ))}
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {paths.map((d, index) => (
          <path
            key={index}
            d={d}
            style={{ fill: "var(--color-accent-soft)", stroke: "var(--color-accent)", strokeWidth: 1.25, strokeOpacity: 0.75 }}
          />
        ))}
      </g>
    </svg>
  );
}

export function EventsCalendar({
  month,
  counts,
  range,
  today,
  onMonthChange,
  onPick,
  onClear,
}: {
  /** "YYYY-MM" */
  month: string;
  /** Скільки подій у кожен день. */
  counts: Record<string, number>;
  range: DayRange | null;
  /** Ключ сьогоднішнього дня; лише після гідрації, щоб розмітка пререндеру не залежала від часу білда. */
  today: string | null;
  onMonthChange: (month: string) => void;
  onPick: (key: string) => void;
  onClear: () => void;
}) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const title = formatMonth(first);

  // Анімація розширення грає лише одразу після кліку (не при переході між місяцями і не при відкритті за посиланням).
  const [anim, setAnim] = useState<{ id: string; anchor: string } | null>(null);
  const rangeId = range ? `${range.from}_${range.to}` : null;
  const animating = anim !== null && anim.id === rangeId ? anim : null;

  function pick(key: string) {
    const next = nextRange(range, key);
    setAnim(next && next.from !== next.to && range ? { id: `${next.from}_${next.to}`, anchor: range.from } : null);
    onPick(key);
  }

  // Розміри сітки потрібні контуру в пікселях: заокруглення мають бути круглими, а не розтягнутими.
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(0);
  useEffect(() => {
    const element = gridRef.current;
    if (!element) return;
    const update = () => setGridWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const monthFirst = dayKey(year, monthNumber - 1, 1);
  const monthLast = dayKey(year, monthNumber - 1, daysInMonth);
  const cellCount = offset + daysInMonth;
  const rows = Math.ceil(cellCount / 7);
  let contour: { startIdx: number; endIdx: number } | null = null;
  if (range && range.from !== range.to && range.from <= monthLast && range.to >= monthFirst) {
    contour = {
      startIdx: range.from >= monthFirst ? offset + Number(range.from.slice(8)) - 1 : offset,
      endIdx: range.to <= monthLast ? offset + Number(range.to.slice(8)) - 1 : cellCount - 1,
    };
  }
  // Швидкість: до 45 мс на клітинку, але вся фігура не довше ~0,42 с.
  const cellsInRange = contour ? contour.endIdx - contour.startIdx + 1 : 1;
  const duration = Math.round(Math.min(45, 420 / cellsInRange) * cellsInRange);
  const contourAnimation = animating && range ? { fromLeft: animating.anchor === range.from, duration } : null;
  const farEdgeDelay = Math.max(0, duration - 60);

  return (
    <section
      aria-label="Календар подій"
      className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-text)] first-letter:uppercase">{title}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Попередній місяць"
            onClick={() => {
              setAnim(null);
              onMonthChange(shiftMonth(month, -1));
            }}
            className="inline-flex size-8 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-strong)] hover:text-[var(--color-text)]"
          >
            <IconArrowRight className="size-4 rotate-180" />
          </button>
          <button
            type="button"
            aria-label="Наступний місяць"
            onClick={() => {
              setAnim(null);
              onMonthChange(shiftMonth(month, 1));
            }}
            className="inline-flex size-8 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-strong)] hover:text-[var(--color-text)]"
          >
            <IconArrowRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 text-center text-[11px] text-[var(--color-text-faint)]" aria-hidden="true">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} className="py-1">
            {weekday}
          </span>
        ))}
      </div>

      <div ref={gridRef} className="relative grid grid-cols-7">
        {contour && gridWidth > 0 && (
          <RangeContour
            key={rangeId}
            width={gridWidth}
            rows={rows}
            startIdx={contour.startIdx}
            endIdx={contour.endIdx}
            animation={contourAnimation}
          />
        )}
        {Array.from({ length: offset }, (_, index) => (
          <span key={`blank-${index}`} aria-hidden="true" />
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const key = dayKey(year, monthNumber - 1, day);
          const count = counts[key] ?? 0;
          const inRange = range !== null && key >= range.from && key <= range.to;
          const edge = range !== null && (key === range.from || key === range.to);
          const label = `${dayLong.format(fromKey(key))}${count > 0 ? `, подій: ${count}` : ", подій немає"}`;
          const popsIn = animating !== null && key !== animating.anchor;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={inRange}
              aria-label={label}
              onClick={() => pick(key)}
              className="group relative z-10 flex h-10 items-center justify-center text-sm tabular-nums outline-none"
            >
              {edge && (
                <span
                  aria-hidden="true"
                  className={"absolute size-10 rounded-full bg-[var(--color-accent)] " + (popsIn ? "cal-edge" : "")}
                  style={popsIn ? { animationDelay: `${Math.max(0, farEdgeDelay - 60)}ms` } : undefined}
                />
              )}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute size-10 rounded-full group-focus-visible:ring-2 group-focus-visible:ring-[var(--color-text)]"
              />
              <span
                className={
                  "relative flex size-[34px] items-center justify-center rounded-full " +
                  (edge
                    ? "font-semibold text-[var(--color-bg)]"
                    : (count > 0 ? "text-[var(--color-text)]" : "text-[var(--color-text-faint)]") +
                      (inRange ? "" : " group-hover:bg-[var(--color-surface-strong)]")) +
                  (today === key && !edge ? " ring-1 ring-inset ring-[var(--color-border-strong)]" : "")
                }
              >
                {day}
              </span>
              {count > 0 && (
                <span
                  aria-hidden="true"
                  className={
                    "absolute bottom-[3px] size-1 rounded-full " + (edge ? "bg-[var(--color-bg)]" : "bg-[var(--color-accent)]")
                  }
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex min-h-8 items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-muted)]">
        <span>{range ? formatRange(range) : "Оберіть день або проміжок. Без вибору видно всі події."}</span>
        {range && (
          <button type="button" onClick={onClear} className="shrink-0 text-[var(--color-text-faint)] hover:text-[var(--color-text)]">
            Скинути
          </button>
        )}
      </div>
    </section>
  );
}
