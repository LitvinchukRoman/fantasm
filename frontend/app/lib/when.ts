const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"] as const;
const MONTHS = ["січень", "лютий", "березень", "квітень", "травень", "червень", "липень", "серпень", "вересень", "жовтень", "листопад", "грудень"];
const MONTHS_GENITIVE = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];

export const MINUTE_STEP = 15;

export type WhenParts = { year: number; month: number; day: number; hour: number; minute: number };

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function parseWhen(value: string): WhenParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const date = new Date(year, month, day, hour, minute);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return { year, month, day, hour, minute };
}

export function composeWhen(parts: WhenParts): string {
  return `${parts.year}-${pad(parts.month + 1)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatPickedWhen(value: string): string {
  const parts = parseWhen(value);
  if (!parts) return "";
  return `${parts.day} ${MONTHS_GENITIVE[parts.month]}, ${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function pickedIsFuture(value: string, now = Date.now()): boolean {
  const parts = parseWhen(value);
  if (!parts) return false;
  return new Date(parts.year, parts.month, parts.day, parts.hour, parts.minute).getTime() > now;
}

/** Якщо вибраний слот уже минув сьогодні, зсуває його на найближчі чверть години. */
export function keepAhead(parts: WhenParts, now = Date.now()): WhenParts {
  const at = new Date(parts.year, parts.month, parts.day, parts.hour, parts.minute).getTime();
  if (at > now) return parts;
  const soon = new Date(now + MINUTE_STEP * 60 * 1000);
  if (soon.getFullYear() !== parts.year || soon.getMonth() !== parts.month || soon.getDate() !== parts.day) return parts;
  let minute = Math.ceil(soon.getMinutes() / MINUTE_STEP) * MINUTE_STEP;
  let hour = soon.getHours();
  if (minute === 60) {
    hour = (hour + 1) % 24;
    minute = 0;
  }
  return { ...parts, hour, minute };
}

export function monthTitle(year: number, month: number): string {
  const name = MONTHS[month] ?? "";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export function weekdayLabels(): readonly string[] {
  return WEEKDAYS;
}

export function monthGrid(year: number, month: number): Array<number | null> {
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  return [...Array(firstWeekday).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
}

export function shiftMonth(cursor: { year: number; month: number }, delta: number): { year: number; month: number } {
  const date = new Date(cursor.year, cursor.month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function startOfDay(year: number, month: number, day: number): number {
  return new Date(year, month, day).getTime();
}

export function padTime(value: number): string {
  return pad(value);
}
