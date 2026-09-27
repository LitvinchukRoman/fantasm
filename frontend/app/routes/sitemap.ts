import { getAllDocs } from "~/lib/content";
import { getIdeas } from "~/lib/ideas";

const siteUrl = "https://ideas.naukma.com";

export function loader() {
  const staticPaths = ["/", "/ideas", "/events", "/guides", "/login"];
  const ideaPaths = getIdeas().map((idea) => `/ideas/${idea.slug}`);
  const guidePaths = getAllDocs().map((doc) => ({
    path: doc.path,
    updated: doc.frontmatter.updatedAt,
  }));

  const urls = [
    ...staticPaths.map((path) => `<url><loc>${siteUrl}${path}</loc></url>`),
    ...ideaPaths.map((path) => `<url><loc>${siteUrl}${path}</loc></url>`),
    ...guidePaths.map(
      (doc) =>
        `<url><loc>${siteUrl}${doc.path}</loc><lastmod>${doc.updated}</lastmod></url>`,
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
