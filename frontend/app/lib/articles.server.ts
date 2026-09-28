import type { ArticleItem } from "~/components/articles/shared";
import { HUB_SLUGS, HUBS, getArticles } from "./content.server";

/**
 * Картки для секції Bento. Свіжіші першими, але розділи чергуються:
 * без цього перші картки сітки всі були б з одного хабу.
 */
export function getArticleItems(): ArticleItem[] {
  const byHub = HUB_SLUGS.map((hub) =>
    getArticles(hub)
      .map((doc) => ({
        hub,
        hubLabel: HUBS[hub].label,
        title: doc.frontmatter.title,
        description: doc.frontmatter.description,
        path: doc.path,
        minutes: doc.readingMinutes,
        date: doc.frontmatter.updatedAt ?? doc.frontmatter.publishedAt,
      }))
      .sort((a, b) => b.date.localeCompare(a.date)),
  );
  const mixed: ArticleItem[] = [];
  for (let i = 0; byHub.some((list) => i < list.length); i += 1) {
    for (const list of byHub) if (list[i]) mixed.push(list[i]);
  }
  return mixed;
}
