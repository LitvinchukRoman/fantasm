/**
 * Клієнтська частина ідей: типи, підписи, форматування. Дані й сід живуть
 * у ideas.server.ts, щоб не потрапляти в бандл і не серіалізуватися зайвий раз.
 * Кампус — рядок `{ id, label }`, не окремий тип «могилянець».
 */

export type Campus = { id: string; label: string };

export const NAUKMA: Campus = { id: "naukma", label: "Могилянка" };

export type IdeaCategory = "STARTUP" | "PROJECT" | "EVENT" | "COMMUNITY" | "OTHER";

export const CATEGORY_LABELS: Record<IdeaCategory, string> = {
  STARTUP: "Стартап",
  PROJECT: "Проєкт",
  EVENT: "Подія",
  COMMUNITY: "Спільнота",
  OTHER: "Інше",
};

export type IdeaAuthor = {
  handle: string;
  name: string;
  verified: boolean;
};

export type IdeaTag = { slug: string; label: string };

export type Idea = {
  slug: string;
  title: string;
  summary: string;
  body: string;
  category: IdeaCategory;
  campus: Campus | null;
  tags: IdeaTag[];
  author: IdeaAuthor;
  votes: number;
  comments: number;
  participants: number;
  createdAt: string;
  updatedAt?: string;
  eventAt?: string;
  eventLocation?: string;
  needsRoles?: string;
  /** Тестові картки для верстки: у прод-білд не потрапляють (див. IDEAS_SEED). */
  fixture?: boolean;
};

/** Картка стрічки: замість markdown-тіла — готовий текст для друку при наведенні. */
export type IdeaCard = Omit<Idea, "body"> & { story: string };

/** Сторінка ідеї: тіло вже відрендерене в HTML. */
export type IdeaView = Omit<Idea, "body"> & { html: string };

/**
 * Дати форматуються в часовому поясі кампусу: білд-сервер і браузер
 * мусять дати однаковий рядок, інакше гідрація розходиться.
 */
const TIME_ZONE = "Europe/Kyiv";

const shortDate = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", timeZone: TIME_ZONE });
const eventDate = new Intl.DateTimeFormat("uk-UA", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

export function formatShortDate(iso: string): string {
  return shortDate.format(new Date(iso));
}

export function timeAgo(iso: string, now = Date.now()): string {
  const days = Math.max(0, Math.round((now - Date.parse(iso)) / 86_400_000));
  if (days === 0) return "сьогодні";
  if (days === 1) return "вчора";
  const mod10 = days % 10;
  const mod100 = days % 100;
  const word = mod10 === 1 && mod100 !== 11 ? "день" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "дні" : "днів";
  return `${days} ${word} тому`;
}

export function eventWhen(iso: string): string {
  return eventDate.format(new Date(iso));
}
