export interface ArticleItem {
  hub: string;
  hubLabel: string;
  title: string;
  description: string;
  path: string;
  minutes: number;
  date: string;
}

export interface HubFilter {
  slug: string;
  label: string;
  count: number;
}

/** ISO-дата → 18.03.2026. UTC, щоб сервер і клієнт рендерили однаково. */
export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export function hubFilters(articles: ArticleItem[]): HubFilter[] {
  const seen = new Map<string, HubFilter>();
  for (const article of articles) {
    const entry = seen.get(article.hub);
    if (entry) entry.count += 1;
    else seen.set(article.hub, { slug: article.hub, label: article.hubLabel, count: 1 });
  }
  return [...seen.values()];
}

export function IconArrowUpRight({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 14 14 6M7.5 6H14v6.5" />
    </svg>
  );
}
