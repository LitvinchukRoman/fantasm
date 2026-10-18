export type ChartPoint = { day: string; value: number };
export type ChartSeries = { name: string; color: string; points: ChartPoint[] };
export type ChartMode = "stack" | "split" | "sum";

/** Корал сайту і приглушені білі. Без чужої палітри дашбордів. */
export const ink = {
  accent: "#ff6363",
  paper: "rgba(237, 238, 242, 0.72)",
  mist: "rgba(237, 238, 242, 0.38)",
  line: "rgba(255, 255, 255, 0.08)",
};

/**
 * Палітра рядів: один відтінок корала світлий і темний, далі нейтральні сірі.
 * Сусіди в стопці чергуються за яскравістю, тож межа видна без нових кольорів.
 */
export const SERIES_COLORS = ["#ff6363", "#9e4245", "#ffb3ab", "#d5d8e0", "#6b7078", "#5e2a2e", "#a7acb6", "#3f434b"];

export function seriesColor(index: number) {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

/**
 * Збирає ряди для графіка. Вибір кількох параметрів лишає їхніми;
 * «сума» додає значення вибраних у один ряд. Порожній вибір дає порожній масив.
 */
export function composeChart(series: ChartSeries[], selected: readonly string[], mode: ChartMode): ChartSeries[] {
  const on = series.filter((item) => selected.includes(item.name));
  if (mode !== "sum") return on;
  const base = on[0];
  if (!base) return [];
  return [{
    name: "Сума",
    color: ink.accent,
    points: base.points.map((point, index) => ({
      day: point.day,
      value: on.reduce((sum, item) => sum + (item.points[index]?.value ?? 0), 0),
    })),
  }];
}

/** Вісь із круглим кроком (1, 2, 2.5, 5 × 10ⁿ), щоб поділки читались як 0, 200, 400, а не 167, 333. */
export function niceScale(value: number, target = 3): { max: number; ticks: number[] } {
  if (value <= 0) return { max: 1, ticks: [0, 1] };
  const raw = value / target;
  const exp = 10 ** Math.floor(Math.log10(raw));
  const m = raw / exp;
  const mant = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 && exp >= 10 ? 2.5 : m <= 5 ? 5 : 10;
  const step = Math.max(1, mant * exp);
  const max = Math.ceil(value / step) * step;
  return { max, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step) };
}
