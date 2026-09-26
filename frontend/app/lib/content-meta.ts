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
