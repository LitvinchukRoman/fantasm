import type { PlanCode, SponsorTier } from "./api-types";

const MONTHS_GENITIVE = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];

/** 14900 → «149 ₴», 14950 → «149,50 ₴». Копійки показуємо лише тоді, коли вони є. */
export function money(minor: number): string {
  const whole = Math.trunc(minor / 100);
  const cents = Math.abs(minor % 100);
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  return `${grouped}${cents ? `,${String(cents).padStart(2, "0")}` : ""}\u00a0₴`;
}

/** «1 грудня» або «1 грудня 2027», якщо рік не поточний. */
export function billingDate(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const day = `${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? day : `${day} ${date.getFullYear()}`;
}

export const PAID_PLANS = ["PLUS", "PRO"] as const satisfies readonly PlanCode[];
export const TIERS = ["SUPPORTER", "BACKER", "PATRON"] as const satisfies readonly SponsorTier[];

export const isPaidPlan = (value: unknown): value is (typeof PAID_PLANS)[number] =>
  PAID_PLANS.includes(value as (typeof PAID_PLANS)[number]);

export const isTier = (value: unknown): value is SponsorTier => TIERS.includes(value as SponsorTier);

/** Українська множина: one (1, 21), few (2–4, 22–24), many (решта). */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** «2 з 3 активних ідей» або «5 активних ідей, без ліміту». */
export function usageText(active: number, limit: number | null): string {
  if (limit === null) return `${active} ${plural(active, "активна ідея", "активні ідеї", "активних ідей")}, без ліміту`;
  return `${active} з ${limit} ${plural(limit, "активної ідеї", "активних ідей", "активних ідей")}`;
}

/** Лічильник спонсорів: «1 спонсор», «3 спонсори», «5 спонсорів». */
export const sponsorsText = (n: number) => `${n} ${plural(n, "спонсор", "спонсори", "спонсорів")}`;

/** Код помилки бекенду, коли план автора не дозволяє ще одну активну ідею. */
export const PAYMENT_REQUIRED = "payment_required";
