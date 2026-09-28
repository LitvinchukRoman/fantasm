import { getAllDocs } from "~/lib/content.server";
import { getIdeas } from "~/lib/ideas.server";
import { absoluteUrl } from "~/lib/seo";

type Entry = { path: string; lastmod?: string };

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (char) => `&#${char.charCodeAt(0)};`);
}

function latest(dates: (string | undefined)[]): string | undefined {
  const valid = dates.filter((date): date is string => Boolean(date)).sort();
  return valid.at(-1);
}

function day(iso: string | undefined) {
  return iso?.slice(0, 10);
}

/**
 * Лише сторінки з `index` у robots-мета: логін, реєстрація, заглушки
 * (/events, /ideas/new) і тестові картки сюди не потрапляють. Sitemap з
 * noindex-адресами — суперечливий сигнал, Search Console позначає його як помилку.
 */
export function loader() {
  const docs = getAllDocs();
  const ideas = getIdeas().filter((idea) => !idea.fixture);
  const ideaDates = ideas.map((idea) => idea.updatedAt ?? idea.createdAt);
  const docDates = docs.map((doc) => doc.frontmatter.updatedAt ?? doc.frontmatter.publishedAt);

  const entries: Entry[] = [
    { path: "/", lastmod: latest([...ideaDates, ...docDates]) },
    { path: "/ideas", lastmod: latest(ideaDates) },
    { path: "/guides", lastmod: latest(docDates) },
    ...docs.map((doc) => ({ path: doc.path, lastmod: doc.frontmatter.updatedAt ?? doc.frontmatter.publishedAt })),
    ...ideas.map((idea) => ({ path: `/ideas/${idea.slug}`, lastmod: idea.updatedAt ?? idea.createdAt })),
  ];

  const urls = entries.map(({ path, lastmod }) => {
    const mod = day(lastmod);
    return `  <url><loc>${escapeXml(absoluteUrl(path))}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ""}</url>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
