/**
 * Без fs і process: цей модуль потрапляє в клієнтський бандл статті.
 * Інакше гідрація падає на `process is not defined`, і зміст не стежить за скролом.
 */
export const HUB_SLUGS = ["startups", "games", "campus"] as const;
export type HubSlug = (typeof HUB_SLUGS)[number];

export const HUBS: Record<HubSlug, { label: string; tagline: string }> = {
  startups: { label: "Стартапи", tagline: "Запусти проєкт зі студентської лави" },
  games: { label: "Ігри та івенти", tagline: "Збери компанію офлайн" },
  campus: { label: "Кампус НаУКМА", tagline: "Життя, клуби й можливості" },
};

export function isHubSlug(value: string): value is HubSlug {
  return (HUB_SLUGS as readonly string[]).includes(value);
}

export interface Faq {
  q: string;
  a: string;
}
export interface Cta {
  label: string;
  href: string;
  note?: string;
}
export interface Frontmatter {
  title: string;
  description: string;
  publishedAt: string;
  updatedAt: string;
  keywords?: string[];
  faq?: Faq[];
  cta?: Cta;
  related?: string[];
  order?: number;
  widget?: string;
}
export interface TocItem {
  depth: 2 | 3;
  text: string;
  id: string;
}
export interface DocLink {
  title: string;
  description: string;
  path: string;
}

/**
 * Те, що лоадер статті віддає клієнту: markdown уже відрендерений у `html`,
 * сирий `body` не серіалізується вдруге поруч із готовою розміткою.
 */
export interface DocView {
  hub: HubSlug;
  slug: string;
  isPillar: boolean;
  path: string;
  frontmatter: Frontmatter;
  html: string;
  readingMinutes: number;
  toc: TocItem[];
}
