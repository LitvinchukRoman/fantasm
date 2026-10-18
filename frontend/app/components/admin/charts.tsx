import { useEffect, useId, useState } from "react";
import { SeriesPicker } from "~/components/admin/series-picker";
import type { AdminPoint } from "~/lib/api-types";
import { composeChart, ink, niceScale, seriesColor, type ChartMode, type ChartSeries } from "~/lib/chart-scale";

const W = 720;
const H = 248;
const PAD = { l: 44, r: 12, t: 18, b: 28 };

type Frame = { w: number; h: number; pad: typeof PAD };

const FULL: Frame = { w: W, h: H, pad: PAD };
const MINI: Frame = { w: W, h: 168, pad: { l: 64, r: 12, t: 14, b: 32 } };

const MODES: Array<{ id: ChartMode; label: string }> = [
  { id: "stack", label: "Стопкою" },
  { id: "split", label: "Окремо" },
  { id: "sum", label: "Сума" },
];

function xAt(i: number, n: number, frame: Frame) {
  if (n <= 1) return frame.pad.l;
  return frame.pad.l + (i * (frame.w - frame.pad.l - frame.pad.r)) / (n - 1);
}

function yAt(value: number, max: number, frame: Frame) {
  const plot = frame.h - frame.pad.t - frame.pad.b;
  return frame.pad.t + (1 - value / Math.max(max, 1)) * plot;
}

function curve(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const mid = (a.x + b.x) / 2;
    d += ` C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}`;
  }
  return d;
}

function shortDay(day: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(day) ? `${day.slice(8, 10)}.${day.slice(5, 7)}` : day;
}

function labelIndexes(n: number, compact: boolean) {
  if (n <= 1) return [0];
  const count = compact ? Math.min(3, n) : n > 16 ? 5 : n > 8 ? 4 : n;
  if (count >= n) return Array.from({ length: n }, (_, i) => i);
  return Array.from({ length: count }, (_, i) => Math.round((i * (n - 1)) / (count - 1)));
}

/** Ближче до cubic-bezier(0.23, 1, 0.32, 1): швидкий старт, м’яка посадка. */
function easeOut(t: number) {
  return 1 - (1 - t) ** 4;
}

const RISE_MS = 280;

function useRise(signature: string) {
  const [seen, setSeen] = useState(signature);
  const [progress, setProgress] = useState(0);
  if (seen !== signature) {
    setSeen(signature);
    setProgress(0);
  }
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now: number) {
      if (reduce) {
        setProgress(1);
        return;
      }
      const t = Math.min(1, (now - start) / RISE_MS);
      setProgress(easeOut(t));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [signature]);
  return progress;
}

/**
 * Графік на кілька параметрів. Вибір рядів, стопка, окремі шкали й сума живуть тут,
 * тож сторінка лише віддає ряди. «Стопкою» складає вибране, «Окремо» дає кожному
 * свій графік, «Сума» додає вибране в один ряд.
 */
export function ExplorerChart({
  series,
  shape = "bars",
  initial,
}: {
  series: Array<{ name: string; points: AdminPoint[]; color?: string }>;
  shape?: "bars" | "area";
  initial?: string[];
}) {
  const colored: ChartSeries[] = series.map((item, index) => ({ ...item, color: item.color ?? seriesColor(index) }));
  const names = colored.map((item) => item.name).join("\0");
  const fallback = initial ?? colored.map((item) => item.name);
  const [picked, setPicked] = useState(names);
  const [selected, setSelected] = useState<string[]>(fallback);
  const [mode, setMode] = useState<ChartMode>("stack");
  if (picked !== names) {
    setPicked(names);
    setSelected(fallback);
  }

  const drawn = composeChart(colored, selected, mode);
  const progress = useRise(`${mode}|${selected.join("|")}|${colored[0]?.points.length ?? 0}|${colored[0]?.points[0]?.day ?? ""}`);
  const many = colored.length > 1;

  return (
    <div>
      {many && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <SeriesPicker options={colored} selected={selected} onChange={setSelected} />
          <div role="radiogroup" aria-label="Як зібрати" className="flex shrink-0 gap-0.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] p-1 text-sm">
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={mode === item.id}
                onClick={() => setMode(item.id)}
                className={
                  "rounded-full px-3.5 py-1.5 transition-[background-color,color] duration-150 ease-[var(--ease-out-expo)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] " +
                  (mode === item.id ? "bg-[var(--color-surface-strong)] text-[var(--color-text)]" : "text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)]")
                }
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {drawn.length === 0 ? (
        <p className="py-16 text-center text-sm text-[var(--color-text-muted)]">Увімкніть хоча б один параметр у списку вище.</p>
      ) : mode === "split" && drawn.length > 1 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {drawn.map((item) => (
            <article key={item.name} className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 pt-3">
              <p className="flex items-center gap-2 px-1 text-sm text-[var(--color-text-muted)]">
                <span aria-hidden="true" className="size-2 rounded-full" style={{ background: item.color }} />
                {item.name}
              </p>
              <Plot series={[{ ...item, color: ink.accent }]} shape={shape} stack={false} progress={progress} frame={MINI} />
            </article>
          ))}
        </div>
      ) : (
        <Plot series={drawn} shape={shape} stack={mode === "stack" && drawn.length > 1} progress={progress} frame={FULL} />
      )}
    </div>
  );
}

function Plot({
  series,
  shape,
  stack,
  progress,
  frame,
}: {
  series: ChartSeries[];
  shape: "bars" | "area";
  stack: boolean;
  progress: number;
  frame: Frame;
}) {
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const n = series[0]?.points.length ?? 0;
  const scale = scaleFor(series, stack, frame.h < 200 ? 2 : 3);
  const max = scale.max;
  const plotH = frame.h - frame.pad.t - frame.pad.b;
  const slot = n > 0 ? (frame.w - frame.pad.l - frame.pad.r) / n : 0;
  const barW = Math.max(1.5, slot * (n > 24 ? 0.62 : 0.72));
  const bars = shape === "bars" || stack;
  const days = series[0]?.points ?? [];
  const font = frame.h < 200 ? 20 : 11;

  function at(event: React.MouseEvent<SVGSVGElement>) {
    if (n < 1) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * frame.w;
    const i = bars
      ? Math.floor((x - frame.pad.l) / Math.max(slot, 1))
      : Math.round(((x - frame.pad.l) / Math.max(frame.w - frame.pad.l - frame.pad.r, 1)) * Math.max(n - 1, 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  }

  const hoverX = hover == null ? 0 : bars ? frame.pad.l + hover * slot + slot / 2 : xAt(hover, n, frame);

  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${frame.w} ${frame.h}`} className="h-auto w-full cursor-crosshair" role="img" onMouseLeave={() => setHover(null)} onMouseMove={at}>
        <defs>
          {series.map((item, index) => (
            <linearGradient key={item.name} id={`${uid}-${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={item.color} stopOpacity={series.length > 1 ? 0.18 : 0.32} />
              <stop offset="100%" stopColor={item.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {scale.ticks.map((tick) => (
          <g key={tick}>
            <line x1={frame.pad.l} x2={frame.w - frame.pad.r} y1={yAt(tick, max, frame)} y2={yAt(tick, max, frame)} stroke={ink.line} />
            <text x="0" y={yAt(tick, max, frame) + 4} fill="currentColor" opacity="0.45" fontSize={font} fontFamily="ui-monospace, monospace">{tick}</text>
          </g>
        ))}
        {labelIndexes(n, frame.h < 200).map((index) => (
          <text key={index} x={bars ? frame.pad.l + index * slot + slot / 2 : xAt(index, n, frame)} y={frame.h - 8} textAnchor="middle" fill="currentColor" opacity="0.45" fontSize={font} fontFamily="ui-monospace, monospace">
            {shortDay(days[index]?.day ?? "")}
          </text>
        ))}
        {hover != null && (
          <line x1={hoverX} x2={hoverX} y1={frame.pad.t} y2={frame.h - frame.pad.b} stroke={ink.accent} strokeOpacity="0.35" />
        )}
        {bars ? (
          <Bars series={series} stack={stack} progress={progress} frame={frame} max={max} plotH={plotH} slot={slot} barW={barW} hover={hover} />
        ) : (
          <Areas uid={uid} series={series} progress={progress} frame={frame} max={max} hover={hover} />
        )}
      </svg>
      {hover != null && days[hover] && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-36 -translate-x-1/2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg)]/95 px-3 py-2 text-xs shadow-[0_12px_40px_rgb(0_0_0/0.35)] backdrop-blur"
          style={{ left: `${Math.min(82, Math.max(18, (hoverX / frame.w) * 100))}%` }}
        >
          <div className="text-[var(--color-text-faint)]">{shortDay(days[hover].day)}</div>
          {series.map((item) => (
            <div key={item.name} className="mt-1 flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-[var(--color-text-muted)]">
                <span aria-hidden="true" className="size-2 rounded-full" style={{ background: item.color }} />
                {item.name}
              </span>
              <span className="tabular-nums">{item.points[hover]?.value ?? 0}</span>
            </div>
          ))}
          {series.length > 1 && (
            <div className="mt-1 flex items-center justify-between gap-4 border-t border-[var(--color-border)] pt-1 text-[var(--color-text-muted)]">
              <span>Разом</span>
              <span className="tabular-nums">{series.reduce((sum, item) => sum + (item.points[hover]?.value ?? 0), 0)}</span>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

function Bars({
  series, stack, progress, frame, max, plotH, slot, barW, hover,
}: {
  series: ChartSeries[];
  stack: boolean;
  progress: number;
  frame: Frame;
  max: number;
  plotH: number;
  slot: number;
  barW: number;
  hover: number | null;
}) {
  const n = series[0]?.points.length ?? 0;
  const base = yAt(0, max, frame);
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        let y = base;
        const groupW = stack ? barW : Math.min(barW, (slot * 0.86) / series.length);
        const origin = frame.pad.l + i * slot + (slot - (stack ? barW : groupW * series.length)) / 2;
        return (
          <g key={`${series[0]?.points[i]?.day ?? "day"}-${i}`} style={{ opacity: hover == null || hover === i ? 1 : 0.4, transition: "opacity 150ms var(--ease-out-expo)" }}>
            {series.map((item, s) => {
              const h = ((item.points[i]?.value ?? 0) / Math.max(max, 1)) * plotH * progress;
              const x = stack ? origin : origin + s * groupW;
              if (stack) y -= h;
              const top = s === series.length - 1;
              return (
                <rect key={item.name} x={x} y={stack ? y : base - h} width={stack ? barW : Math.max(1, groupW - 1)} height={Math.max(h, 0)} rx={top || !stack ? Math.min(3, barW / 2) : 0} fill={item.color}
                  stroke={stack && h > 2 ? "var(--color-surface)" : "none"} strokeWidth="1" />
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

function Areas({
  uid, series, progress, frame, max, hover,
}: {
  uid: string;
  series: ChartSeries[];
  progress: number;
  frame: Frame;
  max: number;
  hover: number | null;
}) {
  const n = series[0]?.points.length ?? 0;
  const base = yAt(0, max, frame);
  return (
    <g>
      {series.map((item, index) => {
        const pts = item.points.map((point, i) => ({ x: xAt(i, n, frame), y: yAt(point.value * progress, max, frame) }));
        const path = curve(pts);
        const area = path ? `${path} L ${xAt(n - 1, n, frame)} ${base} L ${xAt(0, n, frame)} ${base} Z` : "";
        return (
          <g key={item.name}>
            <path d={area} fill={`url(#${uid}-${index})`} />
            <path d={path} fill="none" stroke={item.color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
            {hover != null && <circle cx={xAt(hover, n, frame)} cy={yAt((item.points[hover]?.value ?? 0) * progress, max, frame)} r="3.5" fill={item.color} />}
          </g>
        );
      })}
    </g>
  );
}

function scaleFor(series: ChartSeries[], stack: boolean, target: number) {
  const n = series[0]?.points.length ?? 0;
  if (!stack) return niceScale(Math.max(0, ...series.flatMap((item) => item.points.map((point) => point.value))), target);
  const totals = Array.from({ length: n }, (_, i) => series.reduce((sum, item) => sum + (item.points[i]?.value ?? 0), 0));
  return niceScale(Math.max(0, ...totals), target);
}
