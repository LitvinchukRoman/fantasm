import type { MetadataRoute } from "next";
import { getSitemapSlugs } from "@/lib/api";
import { getAllDocs } from "@/lib/content";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ideas.naukma.com";

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const ideas = await getSitemapSlugs();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${siteUrl}/ideas`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${siteUrl}/events`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${siteUrl}/guides`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
  ];

  // SEO topic clusters: 3 pillars (priority 0.9) + 12 articles (0.8),
  // lastModified straight from each doc's frontmatter `updatedAt` (never `now`).
  const guideRoutes: MetadataRoute.Sitemap = getAllDocs().map((doc) => ({
    url: `${siteUrl}${doc.path}`,
    lastModified: new Date(doc.frontmatter.updatedAt),
    changeFrequency: "monthly",
    priority: doc.isPillar ? 0.9 : 0.8,
  }));

  // Only PUBLIC ideas reach the sitemap (the API feed excludes UKMA_ONLY for anon).
  const ideaRoutes: MetadataRoute.Sitemap = ideas.map(({ slug, lastModified }) => ({
    url: `${siteUrl}/ideas/${slug}`,
    lastModified: lastModified ? new Date(lastModified) : now,
    changeFrequency: "daily",
    priority: 0.6,
  }));

  return [...staticRoutes, ...guideRoutes, ...ideaRoutes];
}
